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

## [0.1.1] - 2023-02-06
### Added
 - add memoized fetch
 - max-concurrent limit on batching recipes
 - added support for multiple template handlers for file names or template keys
 - git repo format (git@repo.com:org/repo) source path support
 - basic tests
 - single file fetching
 - recipe depends: wait for completion and circular dep validation
### Fixed
 - recursive was not triggered after remote prefetch
 - cli was not logging help message (use logger for debug, not error / info / warn)
 - in verbose mode, script stdout was not being printed
### Changed
 - hooks rework - before / after are cli scripts. render still requires export
 - added basic docs
 - added cleanup (rmdir) support for node 16
 - update deps
 - rewrite and refactor recipes, cli, rendering
 - repositories must end with ".git" or be "git@repo.tld"
 - top-level arrays for recipes are no longer valid to simplify parsing and validating
 - buffered output is now default, --no-buffer or --verbose disables

## [0.0.1] - 2021-05-12
### Added
- init proof of concept
