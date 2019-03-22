import { cache } from "../common/decorators";
import { ValidatePlatformCommandBase } from "./command-base";
import { LiveSyncCommandHelper } from "../helpers/livesync-command-helper";

export class DebugPlatformCommand extends ValidatePlatformCommandBase implements ICommand {
	public allowedParameters: ICommandParameter[] = [];

	constructor(private platform: string,
		private $bundleValidatorHelper: IBundleValidatorHelper,
		private $debugService: IDebugService,
		protected $devicesService: Mobile.IDevicesService,
		$platformService: IPlatformService,
		$projectData: IProjectData,
		$options: IOptions,
		$platformsData: IPlatformsData,
		protected $logger: ILogger,
		protected $errors: IErrors,
		private $debugDataService: IDebugDataService,
		private $liveSyncService: IDebugLiveSyncService,
		private $liveSyncCommandHelper: ILiveSyncCommandHelper,
		private $androidBundleValidatorHelper: IAndroidBundleValidatorHelper) {
		super($options, $platformsData, $platformService, $projectData);
	}

	public async execute(args: string[]): Promise<void> {
		await this.$devicesService.initialize({
			platform: this.platform,
			deviceId: this.$options.device,
			emulator: this.$options.emulator,
			skipDeviceDetectionInterval: true
		});

		const debugOptions = <IDebugOptions>_.cloneDeep(this.$options.argv);

		const selectedDeviceForDebug = await this.$devicesService.pickSingleDevice({
			onlyEmulators: this.$options.emulator,
			onlyDevices: this.$options.forDevice,
			deviceId: this.$options.device
		});

		const debugData = this.$debugDataService.createDebugData(this.$projectData, { device: selectedDeviceForDebug.deviceInfo.identifier });

		if (this.$options.start) {
			await this.$liveSyncService.printDebugInformation(await this.$debugService.debug(debugData, debugOptions));
			return;
		}

		await this.$liveSyncCommandHelper.executeLiveSyncOperation([selectedDeviceForDebug], this.platform, {
			deviceDebugMap: {
				[selectedDeviceForDebug.deviceInfo.identifier]: true
			},
			// This will default in the liveSyncCommandHelper
			buildPlatform: undefined,
			skipNativePrepare: false
		});
	}

	public async canExecute(args: string[]): Promise<ICanExecuteCommandOutput> {
		this.$androidBundleValidatorHelper.validateNoAab();

		if (!this.$platformService.isPlatformSupportedForOS(this.platform, this.$projectData)) {
			this.$errors.fail(`Applications for platform ${this.platform} can not be built on this OS`);
		}

		if (this.$options.release) {
			this.$errors.fail("--release flag is not applicable to this command");
		}

		const minSupportedWebpackVersion = this.$options.hmr ? LiveSyncCommandHelper.MIN_SUPPORTED_WEBPACK_VERSION_WITH_HMR : null;
		this.$bundleValidatorHelper.validate(minSupportedWebpackVersion);

		const result = await super.canExecuteCommandBase(this.platform, { validateOptions: true, notConfiguredEnvOptions: { hideCloudBuildOption: true, hideSyncToPreviewAppOption: true } });
		return result;
	}
}

export class DebugIOSCommand implements ICommand {

	@cache()
	private get debugPlatformCommand(): DebugPlatformCommand {
		return this.$injector.resolve<DebugPlatformCommand>(DebugPlatformCommand, { platform: this.platform });
	}

	public allowedParameters: ICommandParameter[] = [];

	constructor(protected $errors: IErrors,
		private $devicePlatformsConstants: Mobile.IDevicePlatformsConstants,
		private $platformService: IPlatformService,
		private $options: IOptions,
		private $injector: IInjector,
		private $sysInfo: ISysInfo,
		private $projectData: IProjectData,
		$iosDeviceOperations: IIOSDeviceOperations,
		$iOSSimulatorLogProvider: Mobile.IiOSSimulatorLogProvider) {
		this.$projectData.initializeProjectData();
		// Do not dispose ios-device-lib, so the process will remain alive and the debug application (NativeScript Inspector or Chrome DevTools) will be able to connect to the socket.
		// In case we dispose ios-device-lib, the socket will be closed and the code will fail when the debug application tries to read/send data to device socket.
		// That's why the `$ tns debug ios --justlaunch` command will not release the terminal.
		// In case we do not set it to false, the dispose will be called once the command finishes its execution, which will prevent the debugging.
		$iosDeviceOperations.setShouldDispose(false);
		$iOSSimulatorLogProvider.setShouldDispose(false);
	}

	public execute(args: string[]): Promise<void> {
		return this.debugPlatformCommand.execute(args);
	}

	public async canExecute(args: string[]): Promise<ICanExecuteCommandOutput> {
		if (!this.$platformService.isPlatformSupportedForOS(this.$devicePlatformsConstants.iOS, this.$projectData)) {
			this.$errors.fail(`Applications for platform ${this.$devicePlatformsConstants.iOS} can not be built on this OS`);
		}

		const isValidTimeoutOption = this.isValidTimeoutOption();
		if (!isValidTimeoutOption) {
			this.$errors.fail(`Timeout option specifies the seconds NativeScript CLI will wait to find the inspector socket port from device's logs. Must be a number.`);
		}

		if (this.$options.inspector) {
			const macOSWarning = await this.$sysInfo.getMacOSWarningMessage();
			if (macOSWarning && macOSWarning.severity === SystemWarningsSeverity.high) {
				this.$errors.fail(`You cannot use NativeScript Inspector on this OS. To use it, please update your OS.`);
			}
		}
		const result = await this.debugPlatformCommand.canExecute(args);
		return result;
	}

	private isValidTimeoutOption() {
		if (!this.$options.timeout) {
			return true;
		}

		const timeout = parseInt(this.$options.timeout, 10);
		if (timeout === 0) {
			return true;
		}

		if (!timeout) {
			return false;
		}

		return true;
	}

	public platform = this.$devicePlatformsConstants.iOS;
}

$injector.registerCommand("debug|ios", DebugIOSCommand);

export class DebugAndroidCommand implements ICommand {

	@cache()
	private get debugPlatformCommand(): DebugPlatformCommand {
		return this.$injector.resolve<DebugPlatformCommand>(DebugPlatformCommand, { platform: this.platform });
	}

	public allowedParameters: ICommandParameter[] = [];

	constructor(protected $errors: IErrors,
		private $devicePlatformsConstants: Mobile.IDevicePlatformsConstants,
		private $injector: IInjector,
		private $projectData: IProjectData) {
		this.$projectData.initializeProjectData();
	}

	public execute(args: string[]): Promise<void> {
		return this.debugPlatformCommand.execute(args);
	}
	public async canExecute(args: string[]): Promise<ICanExecuteCommandOutput> {
		const result = await this.debugPlatformCommand.canExecute(args);
		return result;
	}

	public platform = this.$devicePlatformsConstants.Android;
}

$injector.registerCommand("debug|android", DebugAndroidCommand);
