# Example WatchOS Integration Configuration

This directory contains example configurations demonstrating the enhanced watchOS integration features.

## Directory Structure

```
examples/
  watchos-integration/
    App_Resources/
      iOS/
        watchapp/
          MyWatchApp/
            watchapp.json          # Watch app configuration
            Assets.xcassets/
            Info.plist
            ContentView.swift
        watchextension/
          MyWatchExtension/
            extension.json         # Extension configuration
            Info.plist
            InterfaceController.swift
    Frameworks/
      Data.xcframework/            # Example shared framework
    nativescript.config.ts         # Main project configuration
    README.md
```

## Configuration Files

### 1. nativescript.config.ts

```typescript
import { NativeScriptConfig } from '@nativescript/core';

const config: NativeScriptConfig = {
  id: 'com.example.watchapp',
  appPath: 'app',
  appResourcesPath: 'App_Resources',
  ios: {
    // Main app SPM packages
    SPMPackages: [
      {
        name: 'Alamofire',
        repositoryURL: 'https://github.com/Alamofire/Alamofire.git',
        version: '5.6.4',
        libs: ['Alamofire']
      }
    ],
    
    // Watch-specific configuration
    watchApp: {
      // SPM packages for watch targets
      SPMPackages: [
        {
          name: 'SwiftUICharts',
          repositoryURL: 'https://github.com/AppPear/ChartView.git',
          version: '1.5.5',
          libs: ['SwiftUICharts'],
          // These will be applied to both watch app and extension targets
        },
        {
          name: 'LocalWatchPackage',
          path: './WatchPackages/MyLocalPackage',
          libs: ['MyLocalPackage']
        }
      ]
    }
  }
};

export default config;
```

### 2. watchapp.json

Configuration for the watch app target:

```json
{
  "frameworks": [
    "WatchKit.framework",
    "UserNotifications.framework"
  ],
  "assetcatalogCompilerAppiconName": "AppIcon",
  "targetBuildConfigurationProperties": {
    "ENABLE_BITCODE": "NO",
    "SWIFT_VERSION": "5.0",
    "WATCHOS_DEPLOYMENT_TARGET": "7.0"
  },
  "modules": [
    {
      "name": "Data",
      "path": "Frameworks/Data.xcframework",
      "embed": true,
      "headerSearchPaths": [
        "Frameworks/Data.xcframework/watchos-arm64_arm64_32",
        "Frameworks/Data.xcframework/watchos-arm64_arm64_32/Headers"
      ]
    },
    {
      "name": "SharedModels",
      "path": "Frameworks/SharedModels.xcframework",
      "embed": true,
      "linkerFlags": ["-ObjC"]
    }
  ]
}
```

### 3. extension.json

Configuration for the watch extension target:

```json
{
  "frameworks": [
    "WatchKit.framework",
    "ClockKit.framework",
    "WatchConnectivity.framework"
  ],
  "targetBuildConfigurationProperties": {
    "ENABLE_BITCODE": "NO",
    "SWIFT_VERSION": "5.0",
    "WATCHOS_DEPLOYMENT_TARGET": "7.0"
  },
  "modules": [
    {
      "name": "Data",
      "path": "Frameworks/Data.xcframework",
      "embed": false,
      "headerSearchPaths": [
        "Frameworks/Data.xcframework/watchos-arm64_arm64_32"
      ]
    }
  ],
  "workspaceTarget": "SharedUtilities"
}
```

## Usage Scenarios

See the main [watchOS Integration Guide](../watchos-integration.md) for detailed usage scenarios, troubleshooting, and best practices.

## Quick Start

1. Copy the configuration files to your project
2. Adjust paths and package names to match your setup
3. Build your project:
   ```bash
   ns build ios --for-device
   ```

## Additional Resources

- [Main watchOS Integration Documentation](../watchos-integration.md)
- [Apple Watch Programming Guide](https://developer.apple.com/documentation/watchkit)
- [Swift Package Manager](https://swift.org/package-manager/)
