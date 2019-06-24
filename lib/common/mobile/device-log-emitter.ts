import { DeviceLogProviderBase } from "./device-log-provider-base";
import { DEVICE_LOG_EVENT_NAME } from "../constants";

export class DeviceLogEmitter extends DeviceLogProviderBase {
	constructor(protected $logFilter: Mobile.ILogFilter,
		$logger: ILogger,
		private $loggingLevels: Mobile.ILoggingLevels,
		private $logSourceMapService: Mobile.ILogSourceMapService) {
		super($logFilter, $logger);
	}

	public async logData(line: string, platform: string, deviceIdentifier: string): Promise<void> {
		this.setDefaultLogLevelForDevice(deviceIdentifier);

		const loggingOptions = this.getDeviceLogOptionsForDevice(deviceIdentifier) || { logLevel: this.$loggingLevels.info, projectDir: null };
		let data = this.$logFilter.filterData(platform, line, loggingOptions);
		data = await this.$logSourceMapService.replaceWithOriginalFileLocations(platform, data, loggingOptions);

		if (data) {
			this.emit('data', deviceIdentifier, data);
			this.emit(DEVICE_LOG_EVENT_NAME, data, deviceIdentifier, platform);
		}
	}

	public setLogLevel(logLevel: string, deviceIdentifier?: string): void {
		if (deviceIdentifier) {
			this.setDeviceLogOptionsProperty(deviceIdentifier, (deviceLogOptions: Mobile.IDeviceLogOptions) => deviceLogOptions.logLevel, logLevel.toUpperCase());
		} else {
			this.$logFilter.loggingLevel = logLevel.toUpperCase();

			_.keys(this.devicesLogOptions).forEach(deviceId => {
				this.devicesLogOptions[deviceId] = this.devicesLogOptions[deviceId] || <Mobile.IDeviceLogOptions>{};
				this.devicesLogOptions[deviceId].logLevel = this.$logFilter.loggingLevel;
			});
		}
	}
}

$injector.register("deviceLogProvider", DeviceLogEmitter);
