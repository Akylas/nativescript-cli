# Watch App Configuration Guide

This document describes the configuration options available in `watchapp.json` and `extension.json` files for iOS Watch app development.

## Overview

The `watchapp.json` and `extension.json` files allow you to configure how the NativeScript CLI builds your iOS Watch app targets. These files should be placed in the respective watch app folders:

- `App_Resources/iOS/watchapp/<WatchAppFolder>/watchapp.json`
- `App_Resources/iOS/watchextension/<ExtensionFolder>/extension.json`

## New Configuration Options

### Custom Info.plist Path

You can now specify a custom `Info.plist` file path. The CLI will copy this file to the appropriate location for your watch app target.

```json
{
  "infoPlistPath": "path/to/custom/Info.plist"
}
```

**Notes:**
- The path is relative to the `watchapp.json` file location
- The file will be copied to the target directory if it doesn't exist there
- The `INFOPLIST_FILE` build setting will be automatically configured

### Custom xcprivacy File Path

You can specify a custom Privacy Manifest (`PrivacyInfo.xcprivacy`) file path.

```json
{
  "xcprivacyPath": "path/to/custom/PrivacyInfo.xcprivacy"
}
```

**Notes:**
- The path is relative to the `watchapp.json` file location
- The file will be copied to the target directory as `PrivacyInfo.xcprivacy`
- The file will be automatically added as a resource to the watch app target

### Excluding Files with Glob Patterns

You can now exclude files from being added to the watch app target using glob patterns.

#### Exclude Resources

```json
{
  "resourcesExclude": [
    "**/Info.plist",
    "**/*.xcprivacy",
    "**/unwanted-folder/**"
  ]
}
```

#### Exclude Source Files

```json
{
  "srcExclude": [
    "**/Debug/**",
    "**/*.template.swift",
    "**/old-code/**"
  ]
}
```

**Glob Pattern Examples:**
- `**/Info.plist` - Excludes all Info.plist files in any directory
- `*.xcprivacy` - Excludes all xcprivacy files in the current directory
- `Debug/**` - Excludes all files in the Debug directory and subdirectories
- `**/*.template.*` - Excludes all template files with any extension

## Complete Example

Here's a complete example of a `watchapp.json` configuration:

```json
{
  "infoPlistPath": "../custom-config/WatchApp-Info.plist",
  "xcprivacyPath": "../custom-config/WatchApp-PrivacyInfo.xcprivacy",
  "resourcesExclude": [
    "**/Info.plist",
    "**/PrivacyInfo.xcprivacy",
    "**/node_modules/**"
  ],
  "srcExclude": [
    "**/Debug/**",
    "**/*.backup.swift"
  ],
  "importSourcesFromWatchFolder": true,
  "importResourcesFromWatchFolder": true,
  "modules": [
    {
      "name": "DataModule",
      "path": "../../frameworks/Data.xcframework",
      "embed": true
    }
  ],
  "SPMPackages": [
    {
      "name": "SomePackage",
      "repositoryURL": "https://github.com/example/package",
      "version": "1.0.0",
      "libs": ["SomeLib"]
    }
  ]
}
```

## Build Error Fix

### "Multiple commands produce" Error

This update fixes the Xcode build error:
```
Multiple commands produce '.../ActivelookWatch.app/ActivelookWatch'
```

This error was caused by files being added to the target multiple times. The fix ensures that:
1. Watch app targets are created without automatically adding all files from the directory
2. Files are explicitly added through the source and resource scanning process
3. Exclusion patterns prevent duplicate additions

## Migration Guide

If you're migrating from an older version:

1. **Custom Info.plist**: If you manually configured `INFOPLIST_FILE`, you can now use the `infoPlistPath` option instead
2. **File Exclusions**: If you manually excluded files, you can now use `resourcesExclude` and `srcExclude` glob patterns
3. **Privacy Manifest**: If you manually added xcprivacy files, you can now use `xcprivacyPath` option

## Troubleshooting

### Files Not Being Excluded

Make sure your glob patterns are correct:
- Use `**/` to match any directory depth
- Use `*` to match any file name
- Paths are relative to the platform project root

### Custom Info.plist Not Found

The path should be relative to the location of `watchapp.json`. For example:
- If `watchapp.json` is at `App_Resources/iOS/watchapp/MyWatch/watchapp.json`
- And your Info.plist is at `App_Resources/iOS/watchapp/custom/Info.plist`
- Then use: `"infoPlistPath": "../custom/Info.plist"`

### xcprivacy File Not Added

Ensure:
- The path is correct and relative to `watchapp.json`
- The file has the `.xcprivacy` extension
- The file exists at the specified location
