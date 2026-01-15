# Apple Watch App Integration

This document describes the improved Apple Watch app integration in NativeScript CLI, which supports deeper integration with watchOS apps including SPM packages, module dependencies, and workspace target reuse.

## Overview

The NativeScript CLI now supports advanced watchOS integration beyond basic source and resource files. You can now:

1. Add Swift Package Manager (SPM) dependencies to watch app targets
2. Integrate xcframework modules (like "Data" modules) that can be imported in your WatchApp
3. Reuse existing targets from your xcworkspace (bonus feature)

## Configuration

### Basic Watch App Structure

Place your watch app files in the following structure within your App_Resources:

```
App_Resources/
  iOS/  (or visionOS/)
    watchapp/
      YourWatchApp/
        watchapp.json
        ... (watch app sources and resources)
    watchextension/
      YourWatchExtension/
        extension.json
        ... (watch extension sources)
```

### Enhanced Configuration

#### 1. SPM Packages for Watch App

To add Swift Package Manager packages to your watch app targets, configure them in your `nativescript.config.ts` (or `.js`):

```typescript
export default {
  ios: {
    watchApp: {
      SPMPackages: [
        {
          name: "MyWatchPackage",
          repositoryURL: "https://github.com/example/MyWatchPackage.git",
          version: "1.0.0",
          libs: ["MyWatchPackage"]
        },
        {
          name: "LocalWatchPackage",
          path: "./path/to/local/package",
          libs: ["LocalWatchPackage"]
        }
      ]
    }
  }
}
```

#### 2. Module Dependencies (xcframework modules)

If your watch app needs to import modules from xcframeworks (e.g., `import Data`), configure them in your watch app's `watchapp.json` or `extension.json`:

**watchapp.json example:**
```json
{
  "frameworks": ["WatchKit.framework"],
  "assetcatalogCompilerAppiconName": "AppIcon",
  "modules": [
    {
      "name": "Data",
      "path": "../../../Frameworks/Data.xcframework",
      "embed": true,
      "headerSearchPaths": [
        "../../../Frameworks/Data.xcframework/ios-arm64"
      ],
      "linkerFlags": ["-ObjC"]
    }
  ]
}
```

**Module Configuration Options:**

- `name` (required): Name of the module (e.g., "Data")
- `path` (optional): Path to the framework/xcframework containing the module (relative to project root)
- `embed` (optional): Whether to embed the framework (default: true)
- `headerSearchPaths` (optional): Additional header search paths for the module
- `linkerFlags` (optional): Additional linker flags for the module

#### 3. Workspace Target Reference

To link an existing target from your xcworkspace to your watch app, add this to your watch app configuration:

**watchapp.json or extension.json:**
```json
{
  "workspaceTarget": "ExistingTargetName"
}
```

This creates a target dependency, allowing your watch app to use build products from the existing target.

## Complete Example

Here's a complete configuration example:

**nativescript.config.ts:**
```typescript
export default {
  id: "com.example.app",
  appPath: "app",
  appResourcesPath: "App_Resources",
  ios: {
    SPMPackages: [
      // Regular app packages
      {
        name: "MyPackage",
        repositoryURL: "https://github.com/example/MyPackage.git",
        version: "2.0.0",
        libs: ["MyPackage"]
      }
    ],
    watchApp: {
      // Watch-specific packages
      SPMPackages: [
        {
          name: "WatchConnectivity",
          repositoryURL: "https://github.com/example/WatchConnectivity.git",
          version: "1.5.0",
          libs: ["WatchConnectivity"]
        }
      ]
    }
  }
}
```

**App_Resources/iOS/watchapp/MyWatchApp/watchapp.json:**
```json
{
  "frameworks": ["WatchKit.framework"],
  "assetcatalogCompilerAppiconName": "AppIcon",
  "modules": [
    {
      "name": "Data",
      "path": "Frameworks/SharedData.xcframework",
      "embed": true,
      "headerSearchPaths": ["Frameworks/SharedData.xcframework/watchos-arm64"]
    },
    {
      "name": "Networking",
      "path": "Frameworks/NetworkLayer.xcframework",
      "embed": true
    }
  ],
  "targetBuildConfigurationProperties": {
    "ENABLE_BITCODE": "NO",
    "SWIFT_VERSION": "5.0"
  }
}
```

**App_Resources/iOS/watchextension/MyWatchExtension/extension.json:**
```json
{
  "frameworks": ["WatchKit.framework"],
  "modules": [
    {
      "name": "Data",
      "path": "Frameworks/SharedData.xcframework",
      "embed": false
    }
  ],
  "workspaceTarget": "SharedUtilities"
}
```

## Using Symlinks

You can create symlinks to reuse existing watch app folder architectures:

```bash
cd App_Resources/iOS/
ln -s /path/to/existing/watchapp watchapp
ln -s /path/to/existing/watchextension watchextension
```

The CLI will follow symlinks and integrate the watch app structure into your NativeScript project.

## Building

Once configured, build your project as usual:

```bash
ns build ios --for-device
```

Or run on a device:

```bash
ns run ios --device
```

The CLI will automatically:
1. Add watch app targets to the Xcode project
2. Apply SPM packages to watch targets
3. Link module frameworks
4. Set up target dependencies
5. Resolve SPM dependencies

## Troubleshooting

### Module not found
If you get errors like `No such module 'Data'`, ensure:
- The module path in your configuration is correct
- The xcframework contains the module for watchOS architecture
- Header search paths are properly configured

### SPM packages not resolving
If SPM packages fail to resolve:
- Check your internet connection for remote packages
- Verify local package paths are correct and relative to project root
- Ensure package versions are valid

### Workspace target not found
If the workspace target linking fails:
- Verify the target name matches exactly (case-sensitive)
- Ensure the target exists in your Xcode project
- Check that the target is appropriate for watch app dependency

## Notes

- The watch app integration is currently in Beta
- SPM packages are resolved during the build process
- Module frameworks must be compatible with watchOS
- Workspace target dependencies are established at prepare time

## Related Issues

- [NativeScript CLI Issue #4589](https://github.com/NativeScript/nativescript-cli/issues/4589) - Apple Watch App Support
