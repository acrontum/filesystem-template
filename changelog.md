# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- 
## [version] - date
### Added
### Fixed
### Changed
### Removed
-->

## [Unreleased] - 
### Added
 - add memoized fetch.
 - max-concurrent limit on batching recipes.
 - added support for multiple template handlers for file names or template keys.
 - git repo format (git@repo.com:org/repo) source path support.
### Fixed
 - recursive was not triggered after remote prefetch.
 - cli was not logging help message (use logger for debug, not error / info / warn).
### Changed
 - tweak imports/script now expects exported hooks for more control and flexibitity (before, prerender, after).
 - added basic docs.
 - hooks string value instead of array is handled properly.
 - added cleanup (rmdir) support for node 16.


## [0.0.1] - 2021-05-12
### Added
- init proof of concept.
