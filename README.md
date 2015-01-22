CogniCity
===========
**Open Source GeoSocial Intelligence Framework**

####cognicity-reports-powertrack: NodeJS app to collect unconfirmed reports from Twitter via Gnip PowerTrack and send verification requests.

[![Build Status](https://travis-ci.org/smart-facility/cognicity-reports-powertrack.svg)](https://travis-ci.org/smart-facility/cognicity-reports-powertrack)

### About
Cognicity-reports-powertrack is the NodeJS reports module for the CogniCity framework, responsible for collecting relevant tweets via Gnip PowerTrack, and sending users verification messages via Twitter. For detailed framework documentation see [http://cognicity.info](http://cognicity.info).

### API Documentation
[http://cognicity.info/cognicity/api-docs/cognicity-reports-powertrack/index.html](http://cognicity.info/cognicity/api-docs/cognicity-reports-powertrack/index.html)

### Dependencies
* [NodeJS](http://nodejs.org) version 0.10.16 or compatible
* [PostgreSQL](http://www.postgresql.org) version 9.2 or later, with [PostGIS](http://postgis/) version 2.0 or compatible

#### Node Modules
* [Node-Daemonize 2](https://github.com/niegowski/node-daemonize2/) version 0.4.2 or compatible
* [Node-Postgres](https://github.com/brianc/node-postgres) version 2.0.0 or compatible
* [ntwitter](https://github.com/AvianFlu/ntwitter) version 0.5.0 or compatible
* [gnip](https://github.com/demian85/gnip) version 0.2.1 or compatible
* [winston](https://github.com/flatiron/winston) version 0.8.1 or compatible

#### Dev Modules
* [jshint](https://github.com/jshint/node-jshint) version 2.5.8 or compatible
* [unit.js](http://unitjs.com/) version 1.0.2 or compatible
* [mocha](http://mochajs.org/) version 2.0.1 or compatible
* [jsdoc](https://github.com/jsdoc3/jsdoc) version 3.2.0 or compatible
* [istanbul](https://github.com/gotwarlost/istanbul) version 0.3.5 or compatible

If you're going to commit changes to the JavaScript, be sure to run 'npm test' first - and fix any issues that it complains about, otherwise the build will fail when you push the commit.

### Installation
Download the source code for cognicity-reports-powertrack from github: [http://github.com/smart-facility/cognicity-reports-powertrack](http://github.com/smart-facility/cognicity-reports-powertrack) or view the CogniCity installation documentation at [http://cognicity.info](http://cognicity.info).

Install the node dependencies in package.json using NPM: `npm install`

#### Platform-specific notes ####
To build on OS X we recommend using [homebrew](http://brew.sh) to install node, npm, and required node modules as follows:
```shell
brew install node
npm install
```

To build on Windows we recommend installing all dependencies (making sure to use all 32 bit or all 64 bit, depending on your architecture) plus following the instructions (for Windows 7 follow the Windows 7/8 instructions) for [node-gyp](https://github.com/TooTallNate/node-gyp) and then:
* You need to add *C:\Program Files\PostgreSQL\9.3\bin* (modifying that location if necessary to point to the installed version of PostgreSQL) to path so the build script finds `pg_config`, and
* You need to create the *%APPDATA%\npm* folder and run cmd (and hence npm) as administrator. *%APPDATA%* is usually under *C:\Users\your_username\AppData\Remote*.
* You may need to specify the version of the build tools installed by adding the argument `--msvs_version=2013` to the `npm` command (substituting the appropriate version)
Then you can run `npm install`.

### Configuration
App configuration parameters are stored in a configuration file which is parsed by app.js. See sample-reports-config.js for an example configuration.

#### Logging parameters
* level - info or debug are most useful here, debug will give you more verbose logging output
* maxFileSize - max size (in bytes) of each log file before a new one is created
* maxFiles - number of log files to retain
* logDirectory - Specify a full path to the log directory. If not specified, the application directory will be used.

#### Gnip parameters
* stream [true | false] - set to true to connect to Gnip stream.
* streamTimeout - Gnip stream timeout, should be >30s (in milliseconds)
* username - Gnip username
* password - Gnip password
* streamUrl - URL to fetch JSON stream from Gnip PowerTrack
* rulesUrl - URL to fetch JSON rules from Gnip PowerTrack
* rules - List of objects to configure Gnip PowerTrack rules. Objects contain a series of key-value properties, where the key is the Gnip PowerTrack tag for the rule, and the value is the rule as a string.
* maxReconnectTimeout - Time in seconds that is the longest delay between reconnection attempts for the stream

#### Twitter account configuration
Set the app authentication parameters as provided by Twitter. See the [ntwitter-module](https://github.com/AvianFlu/ntwitter) documentation for more details.
* usernameReplyBlacklist - Twitter usernames (without @, comma separated for multiples) which will never be sent to in response to tweet processing

#### Twitter warning configuration
* adminTwitterUsernames - Enter twitter usernames here (without @, comma separated for multiples) to send a notification tweet on error conditions
Notification conditions are:
* Gnip stream is disconnected and reaches `maxReconnectTimeout` time trying to reconnect
* Connection to postgres is lost and cannot be reconnected in `pg.reconnectionAttempts` number of attempts

#### Twitter send parameters
* send_enabled [true | false] - set to true to enable confirmation request tweets to be sent.
* addTimestamp [true | false] - if true, append a timestamp to each sent tweet.

#### Twitter message text
The messages are stored in objects, where the object name is the name of the message.
Within the object, the property name (key) is the language, and the value is the message text.
There is also a top-level 'defaultLanguage' property which is used if the language code from the tweet cannot be resolved.

##### Languages
* in - Bahasa Indonesian (language code from Gnip)
* id - Bahasa Indonesian (language code from Twitter)
* en - English

##### Messages
Messages can be at most 109 characters long if addTimestamp is enabled, or 123 characters long if addTimestamp is disabled.
* invite_text - Text for confirmation request tweets
* askforgeo_text - Text for geolocation reminders
* thanks_text - Thank-you message for confirmed tweet

#### Postgres connection
* conString - PostgreSQL connection details string (see node-postgres module documenation)[https://github.com/brianc/node-postgres]
* postgres tables as defined in database schema
* reconnectionDelay - Delay between reconnection attempts if postgres connection lost
* reconnectionAttempts - Number of times to attempt to reconnect before dying

### PostgreSQL/PostGIS schema
* see the [cognicity-schema](https://github.com/smart-facility/cognicity-schema) project for schema files

### Run
The app is run as a background process using the Daemonize 2 library. The process name is set to the configuration instance `config.instance` defined in the configuration file.

```shell
$ cd cognicity-server/
$ node daemon.js sample-config.js start
project-name daemon started. PID 1000

$node daemon.js sample-config.js status
project-name running

$node daemon.js sample-config.js stop
project-name daemon stopped
```

### Logging
* Winston writes to project-name.log (and project-name#.log if configured for multiple files)
* The log directory can be configured, by default it is the project directory

### Development

#### Testing

To run the full set of tests, run:

```shell
npm test
```

This will run the following tests:

##### JSHint

JSHint will run on all JavaScript files in the root folder and test folders.

Running the script:

```shell
npm run jshint
```

This will print an error to the screen if any problems are found.

##### Mocha

Mocha will run all unit tests in the test folder and can be run with the following script:

```shell
npm run mocha
```

The test output will tell you how many tests passed and failed.

#### Git Hooks

There is a git pre-commit hook which will run the 'npm test' command before your commit and will fail the commit if testing fails.

To use this hook, copy the file from 'git-hooks/pre-commit' to '.git/hooks/pre-commit' in your project folder.

```shell
cp git-hooks/pre-commit .git/hooks/
```

#### Documentation

To build the JSDoc documentation run the following npm script:

```shell
npm run build-docs
```

This will generate the API documentation in HTML format in the `docs` folder, where you can open it with a web browser.

#### Test Coverage

To build test code coverage documentation, run the following npm script:

```shell
npm run coverage
```

This will run istanbul code coverage over the full mocha test harness and produce HTML documentation in the directory `coverage` where you can open it with a web browser.

#### Release

The release procedure is as follows:
* Update the CHANGELOG.md file with the newly released version, date, and a high-level overview of changes. Commit the change.
* Create a tag in git from the current head of master. The tag version should be the same as the version specified in the package.json file - this is the release version.
* Update the version in the package.json file and commit the change.
* Further development is now on the updated version number until the release process begins again.

### License
This software is released under the GPLv3 License. See License.txt for details.
