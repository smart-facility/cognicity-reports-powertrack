CogniCity
===========
**Open Source GeoSocial Intelligence Framework**

####cognicity-reports-powertrack: NodeJS app to collect unconfirmed reports from Twitter via Gnip PowerTrack and send verification requests.

[![Build Status](https://travis-ci.org/smart-facility/cognicity-reports-powertrack.svg?branch=master)](https://travis-ci.org/smart-facility/cognicity-reports-powertrack)

### About
Cognicity-reports-powertrack is the NodeJS reports module for the CogniCity framework, responsible for collecting relevant tweets via Gnip PowerTrack, and sending users verification messages via Twitter. For detailed framework documentation see [http://cognicity.info](http://cognicity.info).

### Dependencies
* [NodeJS](http://nodejs.org) version 0.10.12 or later
* [PostgreSQL](http://www.postgresql.org) version 9.2 or later, with [PostGIS](http://postgis/) version 2.0 or later.

#### Node Modules
* Node-Daemonize 2 version 0.4.2 or compatible
* Node-Postgres version 2.0.0 or compatible
* ntwitter version 0.5.0 or compatible
* gnip version 0.2.1 or compatible
* winston version 0.8.1 or compatible

#### Dev Modules
* jshint version 2.5.8 or compatible
* unit.js version 1.0.2 or compatible
* mocha version 2.0.1 or compatible

If you're going to commit changes to the JavaScript, be sure to run a 'npm test' first - and fix any issues that it complains about, otherwise the build will fail when you push the commit.

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
Then you can run `npm install`.

### Configuration
App configuration parameters are stored in a configuration file which is parsed by app.js. See sample-reports-config.js for an example configuration.

#### Logging parameters
* level - info or debug are most useful here, debug will give you more verbose logging output
* maxFileSize - max size (in bytes) of each log file before a new one is created
* maxFiles - number of log files to retain

#### Gnip parameters
* stream [true | false] - set to true to connect to Gnip stream.
* streamTimeout - Gnip stream timeout, should be >30s (in milliseconds)
* username - Gnip username
* password - Gnip password
* steamUrl - URL to fetch JSON stream from Gnip PowerTrack
* rulesUrl - URL to fetch JSON rules from Gnip PowerTrack
* rules - List of objects to configure Gnip PowerTrack rules. Objects contain a series of key-value properties, where the key is the Gnip PowerTrack tag for the rule, and the value is the rule as a string.

#### Twitter account configuration
Set the app authentication parameters as provided by Twitter. See the [ntwitter-module](https://github.com/AvianFlu/ntwitter) documentation for more details.

#### Twitter stream parameters
* send_enabled [true | false] - set to true to enable confirmation request tweets to be sent.

#### Twitter message text
* defaultLanguage - Default language if we can't resolve a message in the user's language
* invite_text.in/en - Text for confrmation request tweets [Bahasa Indonesian/English]
* thanks_text.in/en - Text for geolocation reminders [Bahasa Indonesian/English]

#### Postgres connection
* connection string - PostgreSQL connection details (see node-postgres module documenation)[https://github.com/brianc/node-postgres]
* postgres tables as defined in database schema

### PostgreSQL/PostGIS schema (SQL folder)
* createdb.sql creates an empty database for cognicity
* schame.sql adds PostGIS support and builds the relational schema for cognicity

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
Winston writes to project-name.log (and project-name#.log if configured for multiple files)

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
npm run-script jshint
```

Will execute the command:

```shell
jshint *.js test/*.js
```

##### Mocha

Mocha will run all unit tests in the test folder and can be run with the following script:

```shell
npm run-script mocha
```

This will run the command:

```shell
mocha test
```

#### Git Hooks
There is a git pre-commit hook which will run the 'npm test' command before your commit and will fail the commit if testing fails.

To use this hook, copy the file from 'git-hooks/pre-commit' to '.git/hooks/pre-commit' in your project folder.

```shell
cp git-hooks/pre-commit .git/hooks/
```

#### Documentation

To build the JSDoc documentation into the folder 'docs', run the following npm script:

```shell
npm run-script build-docs
```

This runs JSHint using the configuration options in .jshintrc and the command:

```shell
jsdoc -d docs *.js
```

### License
This software is released under the GPLv3 License. See License.txt for details.
