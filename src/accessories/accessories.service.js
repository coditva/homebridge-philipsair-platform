'use strict';

const logger = require('../utils/logger');

class Accessory {
  constructor(api, accessory, handler) {
    this.api = api;
    this.accessory = accessory;
    this.handler = handler;

    this.purifierService = null;
    this.temperatureService = null;
    this.humidityService = null;
    this.lightService = null;

    this.getService();
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // Services
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  getService() {
    logger.info(`Initializing ${this.accessory.displayName}`);

    //Service.AirPurifier
    this.purifierService = this.accessory.getService(this.api.hap.Service.AirPurifier);

    if (!this.purifierService) {
      this.purifierService = this.accessory.addService(
        this.api.hap.Service.AirPurifier,
        this.accessory.displayName,
        'purifier'
      );
    }

    if (!this.purifierService.testCharacteristic(this.api.hap.Characteristic.LockPhysicalControls)) {
      this.purifierService.addCharacteristic(this.api.hap.Characteristic.LockPhysicalControls);
    }

    if (!this.purifierService.testCharacteristic(this.api.hap.Characteristic.RotationSpeed)) {
      this.purifierService.addCharacteristic(this.api.hap.Characteristic.RotationSpeed);
    }

    this.purifierService
      .getCharacteristic(this.api.hap.Characteristic.Active)
      .onSet(async (state) => await this.handler.setPurifierActive(state));

    this.purifierService
      .getCharacteristic(this.api.hap.Characteristic.TargetAirPurifierState)
      .onSet(async (state) => await this.handler.setPurifierTargetState(state));

    this.purifierService
      .getCharacteristic(this.api.hap.Characteristic.LockPhysicalControls)
      .onSet(async (state) => await this.handler.setPurifierLockPhysicalControls(state));

    this.purifierService
      .getCharacteristic(this.api.hap.Characteristic.RotationSpeed)
      .onSet(async (value) => await this.handler.setPurifierRotationSpeed(value))
      .setProps({
        minValue: 0,
        maxValue: 100,
        minStep: 20, // 5 steps: 0, 20, 40, 60, 80, 100
      });

    this.turboModeSwitchService = this.accessory.getService('Turbo Mode');

    if (!this.turboModeSwitchService) {
      this.turboModeSwitchService = this.accessory.addService(this.api.hap.Service.Switch, 'Turbo Mode', 'Turbo Mode');
    }

    this.turboModeSwitchService.addCharacteristic(this.api.hap.Characteristic.Name);
    this.turboModeSwitchService.setCharacteristic(this.api.hap.Characteristic.Name, 'Turbo Mode');

    this.turboModeSwitchService
      .getCharacteristic(this.api.hap.Characteristic.On)
      .onSet(async (state) => await this.handler.setTurboMode(state));

    this.sleepModeSwitchService = this.accessory.getService('Sleep Mode');

    if (!this.sleepModeSwitchService) {
      this.sleepModeSwitchService = this.accessory.addService(this.api.hap.Service.Switch, 'Sleep Mode', 'Sleep Mode');
    }

    this.sleepModeSwitchService.addCharacteristic(this.api.hap.Characteristic.Name);
    this.sleepModeSwitchService.setCharacteristic(this.api.hap.Characteristic.Name, 'Sleep Mode');

    this.sleepModeSwitchService
      .getCharacteristic(this.api.hap.Characteristic.On)
      .onSet(async (state) => await this.handler.setSleepMode(state));

    //Service.AirQuality
    this.airQualityService = this.accessory.getService(this.api.hap.Service.AirQualitySensor);

    if (!this.airQualityService) {
      this.airQualityService = this.accessory.addService(
        this.api.hap.Service.AirQualitySensor,
        'Air Quality',
        'Air Quality'
      );
    }

    if (!this.airQualityService.testCharacteristic(this.api.hap.Characteristic.PM2_5Density)) {
      this.airQualityService.addCharacteristic(this.api.hap.Characteristic.PM2_5Density);
    }

    //Service.FilterMaintenance [Pre-Filter]
    if (!this.accessory.getService('Pre Filter')) {
      this.accessory.addService(this.api.hap.Service.FilterMaintenance, 'Pre Filter', 'Pre Filter');
    }

    //Service.FilterMaintenance [HEPA filter]
    if (!this.accessory.getService('HEPA filter')) {
      this.accessory.addService(this.api.hap.Service.FilterMaintenance, 'HEPA filter', 'HEPA filter');
    }

    //Service.TemperatureSensor
    if (this.accessory.context.config.temperature) {
      this.temperatureService = this.accessory.getService(this.api.hap.Service.TemperatureSensor);

      if (!this.temperatureService) {
        this.temperatureService = this.accessory.addService(
          this.api.hap.Service.TemperatureSensor,
          'Temperature Sensor',
          'Temperature Sensor'
        );
      }
    } else {
      const service = this.accessory.getService(this.api.hap.Service.TemperatureSensor);
      if (service) {
        this.accessory.removeService(service);
      }
    }

    //Service.HumiditySensor
    if (this.accessory.context.config.humidity) {
      this.humidityService = this.accessory.getService(this.api.hap.Service.HumiditySensor);

      if (!this.humidityService) {
        this.humidityService = this.accessory.addService(
          this.api.hap.Service.HumiditySensor,
          'Humidity Sensor',
          'Humidity Sensor'
        );
      }
    } else {
      const service = this.accessory.getService(this.api.hap.Service.HumiditySensor);
      if (service) {
        this.accessory.removeService(service);
      }
    }

    //Service.Lightbulb
    if (this.accessory.context.config.light) {
      this.lightService = this.accessory.getService(this.api.hap.Service.Lightbulb);

      if (!this.lightService) {
        this.lightService = this.accessory.addService(this.api.hap.Service.Lightbulb, 'Light', 'Light');
      }

      if (!this.lightService.testCharacteristic(this.api.hap.Characteristic.Brightness)) {
        this.lightService.addCharacteristic(this.api.hap.Characteristic.Brightness);
      }

      this.lightService
        .getCharacteristic(this.api.hap.Characteristic.On)
        .onSet(async (state) => await this.handler.setLightOn(state));

      this.lightService
        .getCharacteristic(this.api.hap.Characteristic.Brightness)
        .onSet(async (value) => await this.handler.setLightBrightness(value))
        .setProps({
          minValue: 0,
          maxValue: 100,
          minStep: 25,
        });
    } else {
      const service = this.accessory.getService(this.api.hap.Service.Lightbulb);
      if (service) {
        this.accessory.removeService(service);
      }
    }

    this.handler.longPoll();
  }
}

module.exports = Accessory;
