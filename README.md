CogniCity
===========
**Open Source GeoSocial Intelligence Framework**

####cognicity-reports-powertrack: NodeJS app to collect unconfirmed reports from Twitter via Gnip PowerTrack and send verification requests.


### About
Cognicity-reports-powertrack is the NodeJS reports module for the CogniCity framework, responsible for collecting relevant tweets via Gnip PowerTrack, and sending users verification messages via Twitter. For detailed framework documentation see [http://cognicity.info](http://cognicity.info).

### Dependencies
* NodeJS version 0.10.12 or later

#### Node Modules
* Express version 3.2.6 or later
* Node-Daemonize 2 version 0.4.2 or later
* Node-Postgres version 2.0.0 or later
* ntwitter version 0.5.0 or later
* gnip version 0.2.1 or later

### Installation
Download the source code for cognicity-reports-powertrack from github: [http://github.com/smart-facility/cognicity-reports-powertrack](http://github.com/smart-facility/cognicity-reports-powertrack) or view the CogniCity installation documentation at [http://cognicity.info](http://cognicity.info).

Install the node dependencies in package.json using NPM: `npm install`

### Configuration
App configuration parameters are stored in a configuration file which is parsed by app.js. See sample-reports-config.js for an example configuration.

#### Gnip parameters
* stream [true | false] - set to true to connect to Gnip stream.
* streamTimeout - Gnip stream timeout, should be >30s (in milliseconds)
* username - Gnip username
* password - Gnip password
* steamUrl - URL to fetch JSON stream from Gnip PowerTrack
* rulesUrl - URL to fetch JSON rules from Gnip PowerTrack

#### Twitter account configuration
Set the app authentication parameters as provided by Twitter. See the [ntwitter-module](https://github.com/AvianFlu/ntwitter) documentation for more details.

#### Twitter stream parameters
* bounding box coordinates - area of interest (lat, long) cognicity-reports will collect all geo-located tweets in the specified area, and then filter by keyword
* track keywords - cognicity-reports will collect all tweets (geo-located and non-spatial) which contains these words
* city - specify user city to help filter tweets without geolocation data
* users - the Twitter account usernames designated for confirmation tweets.
* send_enabled [true | false] - set to true to enable confirmation request tweets to be sent.

#### Twitter message text
* invite_in/en - Text for confrmation request tweets [Bahasa Indonesian/English]
* thanks_in/en - Text for geolocation reminders [Bahasa Indonesian/English]

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
Express logger writes to project-name.log

### License
This software is released under the GPLv3 License. See License.txt for details.

