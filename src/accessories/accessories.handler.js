'use strict';

const path = require('path');
const { exec, spawn } = require('child_process');

const logger = require('../utils/logger');

class Command {
  constructor(initialArgs) {
    this._cmds = [];
    this._isInteger = false;

    this.initialArgs = initialArgs || [];
  }

  static constants = {
    POWER: 'D03102',
    POWER_OFF: 0,
    POWER_ON: 1,

    MODE: 'D0310C',
    MODE_AUTO: 0,
    MODE_MANUAL: 1,
    MODE_SLEEP: 17,
    MODE_TURBO: 18,
    MODE_MEDIUM: 19,

    CHILD_LOCK: 'D03103',
    CHILD_LOCK_OFF: 0,
    CHILD_LOCK_ON: 1,

    FAN_SPEED: 'D0310C',
    FAN_SPEED_0: 0, // Sleep mode
    FAN_SPEED_1: 1,
    FAN_SPEED_2: 2,
    FAN_SPEED_3: 3, // Medium
    FAN_SPEED_4: 4,
    FAN_SPEED_5: 5, // Turbo

    AIR_QUALITY_IAQL: 'D03120',
    AIR_QUALITY_PM2_5: 'D03221',
    AIR_QUALITY_GAS: 'D03122',
    HUMIDITY: 'D03125',
    TEMPERATURE: 'D03224',

    PRE_FILTER_STATUS: 'D0520D',
    PRE_FILTER_LIFE: 'D05207',
    HEPA_FILTER_STATUS: 'D0540E',
    HEPA_FILTER_LIFE: 'D05408',

    LAMP_MODE: 'D03135',
    LAMP_OFF: 0,
    LAMP_AIR_QUALITY: 1,
    LAMP_AMBIENT: 2,

    LAMP_BRIGHTNESS: 'D03105',
    LAMP_BRIGHTNESS_0: 0, // off
    LAMP_BRIGHTNESS_1: 115, // low
    LAMP_BRIGHTNESS_2: 123, // bright
    LAMP_BRIGHTNESS_3: 101, // auto
  };

  setPower(state) {
    this._isInteger = true;
    this._cmds.push(`${Command.constants.POWER}=${state}`);

    return this;
  }

  setMode(state) {
    this._isInteger = true;
    this._cmds.push(`${Command.constants.MODE}=${state}`);

    return this;
  }

  setChildLock(state) {
    this._isInteger = true;
    this._cmds.push(`${Command.constants.CHILD_LOCK}=${state}`);

    return this;
  }

  setFanSpeed(state) {
    this._isInteger = true;

    // Transform fan speed to mode where applicable
    const transformed = {
      [Command.constants.FAN_SPEED_0]: Command.constants.MODE_SLEEP,
      [Command.constants.FAN_SPEED_1]: Command.constants.FAN_SPEED_1,
      [Command.constants.FAN_SPEED_2]: Command.constants.FAN_SPEED_2,
      [Command.constants.FAN_SPEED_3]: Command.constants.MODE_MEDIUM,
      [Command.constants.FAN_SPEED_4]: Command.constants.FAN_SPEED_4,
      [Command.constants.FAN_SPEED_5]: Command.constants.MODE_TURBO,
    }[state];

    this._cmds.push(`${Command.constants.FAN_SPEED}=${transformed}`);

    return this;
  }

  setLampMode(state) {
    this._isInteger = true;
    this._cmds.push(`${Command.constants.LAMP_MODE}=${state}`);

    return this;
  }

  setLampBrightness(state) {
    this._isInteger = true;
    this._cmds.push(`${Command.constants.LAMP_BRIGHTNESS}=${state}`);

    return this;
  }

  getCommand() {
    return [...this.initialArgs, 'set', this._isInteger ? '-I' : '', ...this._cmds];
  }
}

class Result {
  constructor(data) {
    this._data = data;
  }

  static constants = Command.constants;

  getPower() {
    return parseInt(this._data[Result.constants.POWER]);
  }

  getMode() {
    return parseInt(this._data[Result.constants.MODE]);
  }

  getChildLock() {
    return parseInt(this._data[Result.constants.CHILD_LOCK]);
  }

  getFanSpeed() {
    const speed = parseInt(this._data[Result.constants.FAN_SPEED]);

    return (
      {
        [Result.constants.FAN_SPEED_0]: Result.constants.FAN_SPEED_0,
        [Result.constants.FAN_SPEED_1]: Result.constants.FAN_SPEED_1,
        [Result.constants.FAN_SPEED_2]: Result.constants.FAN_SPEED_2,
        [Result.constants.FAN_SPEED_3]: Result.constants.FAN_SPEED_3,
        [Result.constants.FAN_SPEED_4]: Result.constants.FAN_SPEED_4,
        [Result.constants.FAN_SPEED_5]: Result.constants.FAN_SPEED_5,

        // Fallback for modes
        [Result.constants.MODE_SLEEP]: Result.constants.FAN_SPEED_0,
        [Result.constants.MODE_MEDIUM]: Result.constants.FAN_SPEED_3,
        [Result.constants.MODE_TURBO]: Result.constants.FAN_SPEED_5,
      }[speed] || Result.constants.FAN_SPEED_0
    );
  }

  getAirQuality() {
    return Math.ceil(parseInt(this._data[Result.constants.AIR_QUALITY_IAQL]) / 3);
  }

  getPM2_5() {
    return parseInt(this._data[Result.constants.AIR_QUALITY_PM2_5]);
  }

  getGas() {
    return parseInt(this._data[Result.constants.AIR_QUALITY_GAS]);
  }

  getHumidity() {
    return parseInt(this._data[Result.constants.HUMIDITY]);
  }

  getTemperature() {
    return parseInt(this._data[Result.constants.TEMPERATURE]) / 10;
  }

  getPreFilterStatus() {
    return parseInt(this._data[Result.constants.PRE_FILTER_STATUS]);
  }

  getPreFilterLife() {
    return parseInt(this._data[Result.constants.PRE_FILTER_LIFE]);
  }

  getHepaFilterStatus() {
    return parseInt(this._data[Result.constants.HEPA_FILTER_STATUS]);
  }

  getHepaFilterLife() {
    return parseInt(this._data[Result.constants.HEPA_FILTER_LIFE]);
  }

  getLampMode() {
    return parseInt(this._data[Result.constants.LAMP_MODE]);
  }

  getLampBrightness() {
    return parseInt(this._data[Result.constants.LAMP_BRIGHTNESS]);
  }
}

class Handler {
  constructor(api, accessory) {
    this.api = api;
    this.accessory = accessory;

    this.shutdown = false;
    this.airControl = null;
    this.obj = {};

    this.args = [
      'python3',
      `${path.resolve(__dirname, '../../')}/lib/pyaircontrol.py`,
      '-H',
      this.accessory.context.config.host,
      '-P',
      this.accessory.context.config.port,
      this.accessory.context.config.debug ? '-D' : '',
    ].filter((cmd) => cmd);
  }

  sendCMD(args) {
    logger.debug(`CMD: ${args.join(' ')}`, this.accessory.displayName);

    return new Promise((resolve, reject) => {
      exec(args.join(' '), (err, stdout, stderr) => {
        if (err) {
          return reject(err);
        }

        logger.debug(stderr, this.accessory.displayName);
        resolve();
      });
    });
  }

  //Air Purifier
  async setPurifierActive(state) {
    try {
      const isActive = state === this.api.hap.Characteristic.Active.ACTIVE;
      const args = new Command(this.args)
        .setPower(isActive ? Command.constants.POWER_ON : Command.constants.POWER_OFF)
        .getCommand();

      this.purifierService.updateCharacteristic(
        this.api.hap.Characteristic.CurrentAirPurifierState,
        state === 0
          ? this.api.hap.Characteristic.CurrentAirPurifierState.INACTIVE
          : this.api.hap.Characteristic.CurrentAirPurifierState.PURIFYING_AIR
      );

      logger.info(`Purifier Active: ${state}`, this.accessory.displayName);
      await this.sendCMD(args);
    } catch (err) {
      logger.warn('An error occured during changing purifier state!', this.accessory.displayName);
      logger.error(err, this.accessory.displayName);
    }
  }

  async setPurifierTargetState(state) {
    try {
      const isAuto = state == this.api.hap.Characteristic.TargetAirPurifierState.AUTO;

      if (isAuto) {
        this.purifierService
          .updateCharacteristic(this.api.hap.Characteristic.RotationSpeed, 0)
          .updateCharacteristic(this.api.hap.Characteristic.TargetAirPurifierState, state);
      }

      const args = new Command(this.args)
        .setMode(isAuto ? Command.constants.MODE_AUTO : Command.constants.MODE_MANUAL)
        .getCommand();

      logger.info(`Purifier Mode: ${state}`, this.accessory.displayName);

      await this.sendCMD(args);
    } catch (err) {
      logger.warn('An error occured during changing target purifier state!', this.accessory.displayName);
      logger.error(err, this.accessory.displayName);
    }
  }

  async setPurifierLockPhysicalControls(state) {
    try {
      const isLockOn = state == this.api.hap.Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED;
      const args = new Command()
        .setChildLock(isLockOn ? Command.constants.CHILD_LOCK_ON : Command.constants.CHILD_LOCK_OFF)
        .getCommand();

      logger.info(`Lock: ${state}`, this.accessory.displayName);

      await this.sendCMD(args);
    } catch (err) {
      logger.warn('An error occured during changing lock state!', this.accessory.displayName);
      logger.error(err, this.accessory.displayName);
    }
  }

  async setPurifierRotationSpeed(value) {
    try {
      const divisor = 20;
      const speed = {
        0: Command.constants.FAN_SPEED_0,
        1: Command.constants.FAN_SPEED_1,
        2: Command.constants.FAN_SPEED_2,
        3: Command.constants.FAN_SPEED_3,
        4: Command.constants.FAN_SPEED_4,
        5: Command.constants.FAN_SPEED_5,
      }[Math.ceil(value / divisor)];

      this.purifierService.updateCharacteristic(
        this.api.hap.Characteristic.TargetAirPurifierState,
        this.api.hap.Characteristic.TargetAirPurifierState.MANUAL
      );

      const args = new Command(this.args).setFanSpeed(speed).getCommand();

      logger.info(`Purifier Rotation Speed: ${value}`, this.accessory.displayName);

      await this.sendCMD(args);
    } catch (err) {
      logger.warn('An error occured during changing purifier rotation speed!', this.accessory.displayName);
      logger.error(err, this.accessory.displayName);
    }
  }

  //Light
  async setLightOn(state) {
    if (this.settingBrightess) {
      return;
    }

    this.settingLightState = true;

    try {
      const cmd = new Command(this.args);

      if (state) {
        cmd.setLampMode(Command.constants.LAMP_AIR_QUALITY);
      } else {
        cmd.setLampMode(Command.constants.LAMP_OFF);
      }

      logger.info(`Light state: ${state}`, this.accessory.displayName);

      await this.sendCMD(cmd.getCommand());
    } catch (err) {
      logger.warn('An error occured during changing light state!', this.accessory.displayName);
      logger.error(err, this.accessory.displayName);
    }

    this.settingLightState = false;
  }

  async setLightBrightness(value) {
    if (this.settingLightState) {
      return;
    }

    this.settingBrightess = true;

    try {
      const brightness = {
        0: Command.constants.LAMP_BRIGHTNESS_0,
        1: Command.constants.LAMP_BRIGHTNESS_1,
        2: Command.constants.LAMP_BRIGHTNESS_2,
        3: Command.constants.LAMP_BRIGHTNESS_3,
        4: Command.constants.LAMP_BRIGHTNESS_3,
      }[Math.ceil(value / 25)];

      const cmd = new Command(this.args).setLampBrightness(brightness);

      if (brightness != Command.constants.LAMP_BRIGHTNESS_0) {
        cmd.setLampMode(Command.constants.LAMP_AIR_QUALITY);
      } else {
        cmd.setLampMode(Command.constants.LAMP_OFF);
      }

      logger.info(`Brightness: ${value}`, this.accessory.displayName);

      await this.sendCMD(cmd.getCommand());
    } catch (err) {
      logger.warn('An error occured during changing light brightness!', this.accessory.displayName);
      logger.error(err, this.accessory.displayName);
    }

    this.settingBrightess = false;
  }

  async setSleepMode(state) {
    try {
      const args = new Command(this.args)
        .setMode(state ? Command.constants.MODE_SLEEP : Command.constants.MODE_AUTO)
        .getCommand();

      this.sleepModeService.updateCharacteristic(this.api.hap.Characteristic.On, state);
      this.purifierService.updateCharacteristic(
        this.api.hap.Characteristic.TargetAirPurifierState,
        this.api.hap.Characteristic.TargetAirPurifierState.AUTO
      );
      this.purifierService.updateCharacteristic(this.api.hap.Characteristic.RotationSpeed, 0);

      logger.info(`Sleep Mode: ${state}`, this.accessory.displayName);

      await this.sendCMD(args);
    } catch (err) {
      logger.warn('An error occured during changing sleep mode!', this.accessory.displayName);
      logger.error(err, this.accessory.displayName);
    }
  }

  //Longpoll Process
  longPoll() {
    this.purifierService = this.accessory.getService(this.api.hap.Service.AirPurifier);
    this.temperatureService = this.accessory.getService('Temperature Sensor');
    this.humidityService = this.accessory.getService('Humidity Sensor');
    this.lightService = this.accessory.getService('Light');

    this.airQualityService = this.accessory.getService('Air Quality');
    this.preFilterService = this.accessory.getService('Pre Filter');
    this.hepaFilterService = this.accessory.getService('HEPA filter');

    this.sleepModeService = this.accessory.getService('Sleep Mode');

    const args = [...this.args];
    args.push('status-observe', '-J');

    this.airControl = spawn(args.shift(), args);

    this.airControl.stdout.on('data', async (data) => {
      this.obj = JSON.parse(data.toString());
      logger.debug(data.toString(), this.accessory.displayName);

      const result = new Result(this.obj);

      //Air Purifier
      this.purifierService
        .updateCharacteristic(
          this.api.hap.Characteristic.Active,
          result.getPower() === Result.constants.POWER_ON
            ? this.api.hap.Characteristic.Active.ACTIVE
            : this.api.hap.Characteristic.Active.INACTIVE
        )
        .updateCharacteristic(
          this.api.hap.Characteristic.CurrentAirPurifierState,
          result.getPower() === Result.constants.POWER_ON
            ? this.api.hap.Characteristic.CurrentAirPurifierState.PURIFYING_AIR
            : this.api.hap.Characteristic.CurrentAirPurifierState.INACTIVE
        )
        .updateCharacteristic(
          this.api.hap.Characteristic.TargetAirPurifierState,
          result.getMode() === Result.constants.MODE_AUTO
            ? this.api.hap.Characteristic.TargetAirPurifierState.AUTO
            : this.api.hap.Characteristic.TargetAirPurifierState.MANUAL
        )
        .updateCharacteristic(
          this.api.hap.Characteristic.LockPhysicalControls,
          result.getChildLock() === Result.constants.CHILD_LOCK_ON
            ? this.api.hap.Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED
            : this.api.hap.Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED
        )
        .updateCharacteristic(this.api.hap.Characteristic.RotationSpeed, result.getFanSpeed() * 20);

      if (this.airQualityService) {
        this.airQualityService
          .updateCharacteristic(this.api.hap.Characteristic.AirQuality, result.getAirQuality())
          .updateCharacteristic(this.api.hap.Characteristic.PM2_5Density, result.getPM2_5());
      }

      if (this.temperatureService) {
        this.temperatureService.updateCharacteristic(
          this.api.hap.Characteristic.CurrentTemperature,
          result.getTemperature()
        );
      }

      if (this.humidityService) {
        this.humidityService.updateCharacteristic(
          this.api.hap.Characteristic.CurrentRelativeHumidity,
          result.getHumidity()
        );
      }

      if (this.lightService) {
        if (result.getLampMode() != Result.constants.LAMP_OFF) {
          this.lightService.updateCharacteristic(this.api.hap.Characteristic.On, true).updateCharacteristic(
            this.api.hap.Characteristic.Brightness,
            {
              [Result.constants.LAMP_BRIGHTNESS_0]: 0,
              [Result.constants.LAMP_BRIGHTNESS_1]: 25,
              [Result.constants.LAMP_BRIGHTNESS_2]: 75,
              [Result.constants.LAMP_BRIGHTNESS_3]: 100,
            }[result.getLampBrightness()]
          );
        } else {
          this.lightService.updateCharacteristic(this.api.hap.Characteristic.On, false);
          this.lightService.updateCharacteristic(this.api.hap.Characteristic.Brightness, 0);
        }
      }

      if (this.preFilterService) {
        const fltsts0change = result.getPreFilterStatus() == 0;
        const fltsts0maxlife = result.getPreFilterLife() ? result.getPreFilterLife() : 720;
        const fltsts0life = (result.getPreFilterStatus() / fltsts0maxlife) * 100;

        this.preFilterService
          .updateCharacteristic(this.api.hap.Characteristic.FilterChangeIndication, fltsts0change)
          .updateCharacteristic(this.api.hap.Characteristic.FilterLifeLevel, fltsts0life);
      }

      if (this.hepaFilterService) {
        const fltsts1change = result.getHepaFilterStatus() == 0;
        const fltsts1maxlife = result.getHepaFilterLife() ? result.getHepaFilterLife() : 4800;
        const fltsts1life = (result.getHepaFilterStatus() / fltsts1maxlife) * 100;

        this.hepaFilterService
          .updateCharacteristic(this.api.hap.Characteristic.FilterChangeIndication, fltsts1change)
          .updateCharacteristic(this.api.hap.Characteristic.FilterLifeLevel, fltsts1life);
      }

      if (this.sleepModeService) {
        this.sleepModeService.updateCharacteristic(
          this.api.hap.Characteristic.On,
          result.getMode() === Result.constants.MODE_SLEEP
        );
      }
    });

    this.airControl.stderr.on('data', (data) => {
      logger.debug(data.toString(), this.accessory.displayName);
    });

    this.airControl.stderr.on('exit', () => {
      logger.debug(
        `airControl process killed (${this.shutdown ? 'expected' : 'not expected'})`,
        this.accessory.displayName
      );

      clearTimeout(this.processTimeout);

      if (!this.shutdown) {
        logger.debug('Restarting polling process', this.accessory.displayName);
      }
    });

    this.processTimeout = setTimeout(() => {
      if (this.airControl) {
        this.airControl.kill();
        this.airControl = null;
      }

      this.longPoll();
    }, 1 * 60 * 1000);
  }

  kill(shutdown) {
    this.shutdown = shutdown || false;

    if (this.airControl) {
      logger.debug('Killing airControl process', this.accessory.displayName);
      this.airControl.kill();
    }
  }
}

module.exports = Handler;
