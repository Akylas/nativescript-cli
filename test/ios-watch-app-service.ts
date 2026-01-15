import { assert } from "chai";
import * as yok from "../lib/common/yok";
import { IOSWatchAppService } from "../lib/services/ios-watch-app-service";
import { ProjectDataStub } from "./stubs";
import { IFileSystem } from "../lib/common/declarations";
import { IProjectData } from "../lib/definitions/project";
import { IInjector } from "../lib/common/definitions/yok";

describe("ios-watch-app-service", () => {
	let testInjector: IInjector;
	let service: IOSWatchAppService;
	let fs: IFileSystem;
	let projectData: IProjectData;

	beforeEach(() => {
		testInjector = new yok.Yok();
		testInjector.register("fs", {
			exists: (p: string): boolean => false,
			readJson: (p: string): any => ({}),
			readDirectory: (p: string): string[] => [],
			getFsStats: (p: string): any => ({ isDirectory: () => false }),
			writeFile: (): void => {},
		});
		testInjector.register("pbxprojDomXcode", {});
		testInjector.register("xcode", {
			project: function () {
				return {
					parseSync: () => {},
					writeSync: () => "test",
					getFirstTarget: () => ({ uuid: "test-uuid" }),
				};
			},
		});
		testInjector.register("iOSNativeTargetService", {
			getTargetDirectories: () => ["test"],
			addTargetToProject: () => ({
				uuid: "target-uuid",
				pbxNativeTarget: { productName: "test" },
			}),
			setXcodeTargetBuildConfigurationProperties: () => {},
			setConfigurationsFromJsonFile: () => {},
			prepareSigning: () => {},
		});
		testInjector.register("logger", {
			trace: () => {},
			warn: () => {},
			info: () => {},
		});
		testInjector.register("projectConfigService", {
			getValue: (key: string, defaultValue: any) => defaultValue,
		});

		fs = testInjector.resolve("fs");
		service = testInjector.resolve(IOSWatchAppService);
		projectData = new ProjectDataStub();
	});

	describe("addWatchAppFromPath", () => {
		it("should return false when watch app folders don't exist", async () => {
			const result = await service.addWatchAppFromPath({
				watchAppFolderPath: "/test/path",
				projectData,
				platformData: {
					projectRoot: "/test",
					normalizedPlatformName: "iOS",
					platformNameLowerCase: "ios",
				} as any,
				pbxProjPath: "/test/project.pbxproj",
			});

			assert.isFalse(result);
		});

		it("should return true when watch app folders exist", async () => {
			fs.exists = (p: string) => true;
			fs.readDirectory = (p: string) => ["TestApp"];

			const result = await service.addWatchAppFromPath({
				watchAppFolderPath: "/test/path",
				projectData,
				platformData: {
					projectRoot: "/test",
					normalizedPlatformName: "iOS",
					platformNameLowerCase: "ios",
				} as any,
				pbxProjPath: "/test/project.pbxproj",
			});

			assert.isTrue(result);
		});
	});

	describe("hasWatchApp", () => {
		it("should return false when watch app folder doesn't exist", () => {
			const result = service.hasWatchApp(
				{
					projectRoot: "/test",
					normalizedPlatformName: "iOS",
				} as any,
				projectData
			);

			assert.isFalse(result);
		});

		it("should return true when watch app folder exists", () => {
			fs.exists = (p: string) => true;

			const result = service.hasWatchApp(
				{
					projectRoot: "/test",
					normalizedPlatformName: "iOS",
				} as any,
				projectData
			);

			assert.isTrue(result);
		});
	});

	describe("getWatchSPMPackages", () => {
		it("should return empty array when no packages configured", () => {
			const packages = (service as any).getWatchSPMPackages(projectData, {
				platformNameLowerCase: "ios",
			});

			assert.isArray(packages);
			assert.lengthOf(packages, 0);
		});

		it("should return configured watch SPM packages", () => {
			const mockPackages = [
				{
					name: "TestPackage",
					repositoryURL: "https://github.com/test/package",
					version: "1.0.0",
					libs: ["TestLib"],
				},
			];

			testInjector.resolve("projectConfigService").getValue = (
				key: string,
				defaultValue: any
			) => {
				if (key === "ios.watchApp.SPMPackages") {
					return mockPackages;
				}
				return defaultValue;
			};

			const packages = (service as any).getWatchSPMPackages(projectData, {
				platformNameLowerCase: "ios",
			});

			assert.deepEqual(packages, mockPackages);
		});
	});

	describe("processWatchAppConfiguration", () => {
		it("should handle missing config file gracefully", async () => {
			await (service as any).processWatchAppConfiguration(
				"/nonexistent/path",
				"TestTarget",
				{ uuid: "test-uuid", pbxNativeTarget: { productName: "test" } },
				{
					addFramework: () => {},
					addBuildProperty: () => {},
					addToHeaderSearchPaths: () => {},
				},
				projectData,
				{ projectRoot: "/test" }
			);

			// Should not throw
		});

		it("should process module configurations", async () => {
			const config = {
				modules: [
					{
						name: "Data",
						path: "Frameworks/Data.xcframework",
					},
				],
			};

			fs.exists = (p: string) => true;
			fs.readJson = (p: string) => config;

			let frameworkAdded = false;
			const mockProject = {
				addFramework: () => {
					frameworkAdded = true;
				},
				addBuildProperty: () => {},
				addToHeaderSearchPaths: () => {},
			};

			await (service as any).processWatchAppConfiguration(
				"/test/config.json",
				"TestTarget",
				{ uuid: "test-uuid", pbxNativeTarget: { productName: "test" } },
				mockProject,
				projectData,
				{ projectRoot: "/test", platformNameLowerCase: "ios" }
			);

			assert.isTrue(frameworkAdded);
		});
	});
});
