# Summary of Changes - IOSWatchAppService Enhancements

## Problem Statement

The user requested several enhancements to the IOSWatchAppService and watchapp.json handling:

1. Support for custom Info.plist path configuration
2. Support for glob pattern-based file exclusions for resources and source files
3. Support for custom xcprivacy file path configuration
4. Fix for Xcode build error: "Multiple commands produce"

## Solutions Implemented

### 1. Custom Info.plist Path Support

**File Modified:** `lib/services/ios-watch-app-service.ts`

**Changes:**
- Added `infoPlistPath` configuration option to watchapp.json
- The service now reads this path, copies the custom Info.plist to the target directory
- Automatically sets the `INFOPLIST_FILE` build setting to point to the custom file

**Code Location:** Lines 451-468 in configureTarget method

**Usage Example:**
```json
{
  "infoPlistPath": "../custom-config/WatchApp-Info.plist"
}
```

### 2. Custom xcprivacy File Path Support

**File Modified:** `lib/services/ios-watch-app-service.ts`

**Changes:**
- Added `xcprivacyPath` configuration option to watchapp.json
- The service now reads this path, copies the custom Privacy Manifest file to the target directory
- Automatically adds the file as a resource to the watch app target

**Code Location:** Lines 470-487 in configureTarget method

**Usage Example:**
```json
{
  "xcprivacyPath": "../custom-config/WatchApp-PrivacyInfo.xcprivacy"
}
```

### 3. Glob Pattern-Based File Exclusions

**File Modified:** `lib/services/ios-watch-app-service.ts`

**Changes:**
- Added `resourcesExclude` configuration option for excluding resource files
- Added `srcExclude` configuration option for excluding source files
- Implemented `shouldExclude` helper method using minimatch library for glob pattern matching
- Updated `addSourceFilesFromDirectory` and `addResourcesFromDirectory` to accept and use exclusion patterns

**Code Location:**
- Lines 501-503 in configureTarget method
- Lines 208-242 in addSourceFilesFromDirectory method
- Lines 279-322 in addResourcesFromDirectory method
- Lines 999-1009 shouldExclude helper method

**Usage Example:**
```json
{
  "resourcesExclude": [
    "**/Info.plist",
    "**/PrivacyInfo.xcprivacy"
  ],
  "srcExclude": [
    "**/Debug/**",
    "**/*.template.swift"
  ]
}
```

### 4. Fix for "Multiple Commands Produce" Build Error

**File Modified:** `lib/services/ios-watch-app-service.ts`

**Problem:** The error occurred because files were being added to the Xcode target multiple times:
1. First by `addTargetToProject` in ios-native-target-service.ts which automatically added all files
2. Again by `addWatchAppSourceFiles` and `addWatchAppResources` methods

**Solution:**
- Created new `addTargetWithoutFiles` method that creates the target structure without automatically adding files
- This method creates build phases and groups but with empty file lists
- Files are then explicitly added through the controlled source and resource scanning process
- This prevents duplicate file additions and resolves the build error

**Code Location:** Lines 159-215 in addTargetWithoutFiles method

## Additional Changes

### Import Statements

Added necessary imports:
- `IXcodeTargetBuildConfigurationProperty` from project definitions
- `Minimatch` from minimatch package for glob pattern matching

### Method Signature Updates

Updated the following methods to accept optional exclusion patterns:
- `addWatchAppSourceFiles` - Added `excludePatterns?: string[]` parameter
- `addWatchAppResources` - Added `excludePatterns?: string[]` parameter
- `addSourceFilesFromDirectory` - Added `excludePatterns?: string[]` parameter
- `addResourcesFromDirectory` - Added `excludePatterns?: string[]` parameter

## Documentation

Created comprehensive documentation file `WATCHAPP_CONFIG.md` that includes:
- Overview of watchapp.json configuration
- Detailed explanation of new configuration options
- Usage examples
- Complete configuration example
- Migration guide
- Troubleshooting section

## Testing

The changes compile successfully with no TypeScript errors. The build process completes without issues.

**Note:** Manual testing of the watch app functionality would require an actual NativeScript project with iOS watch app setup.

## Security Considerations

- File paths are validated using `this.$fs.exists()` before operations
- Files are copied rather than symlinked for security
- Glob patterns use the well-established `minimatch` library which is already a dependency

## Backward Compatibility

All changes are backward compatible:
- New configuration options are optional
- Default behavior unchanged if new options are not specified
- Existing watchapp.json configurations continue to work without modification

## Benefits

1. **Flexibility:** Developers can now use existing Info.plist and xcprivacy files
2. **Control:** Fine-grained control over which files to include/exclude
3. **Reliability:** Fixes the "Multiple commands produce" build error
4. **Maintainability:** Cleaner separation of concerns with explicit file management
