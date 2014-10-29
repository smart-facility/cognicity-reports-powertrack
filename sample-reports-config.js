//sample-config.js - sample configuration file for cognicity-reports module

var config = {};

// Instance name - default name for this configuration (will be server process name)
config.instance = 'cognicity-reports-powertrack';

//Logging configuration
config.logger = {}
config.logger.level = "info"; // What level to log at; info or debug are most useful
config.logger.maxFileSize = 1024 * 1024 * 100; // Max file size in bytes of each log file; default 100MB
config.logger.maxFiles = 10; // Max number of log files kept

//Twitter app authentication details
config.twitter = {};
config.twitter.consumer_key = '';
config.twitter.consumer_secret = '';
config.twitter.access_token_key = '';
config.twitter.access_token_secret = '';

//Gnip Powertrack API
config.gnip = {};
config.gnip.stream = true; //connect to stream and log reports?
config.gnip.streamTimeout = 60000; // Must be >30s as a keep-alive is sent at least every 30s
config.gnip.username = 'username';
config.gnip.password = 'password';
config.gnip.steamUrl = 'https://stream.gnip.com:443/accounts/ACCOUNT_NAME/publishers/twitter/streams/track/prod.json';
config.gnip.rulesUrl = 'https://api.gnip.com:443/accounts/ACCOUNT_NAME/publishers/twitter/streams/track/prod/rules.json';

//Twitter stream parameters
config.twitter.bbox = '106.5894, -6.4354, 107.0782, -5.9029'; // Jakarta appx.
config.twitter.track = 'flood, banjir'; //Twitter track keywords
config.twitter.city = 'jakarta'; //User profile location keyword
config.twitter.users = '@petajkt'; //Verification twitter account
config.twitter.send_enabled = false; //send verfication requests?

//Twitter message texts
config.twitter.invite_text_in = 'Invite/Verification Tweet Text [IN]';
config.twitter.invite_text_en = 'Invite/Verification Tweet Text [EN]';
config.twitter.thanks_text_in = 'Thanks/location-enabled reminder Tweet Text [IN]';
config.twitter.thanks_text_en = 'Thanks/location-enabled reminder Tweet Text [EN]';

//Postgres database connection
config.pg = {};
config.pg.conString = "postgres://postgres:password@localhost:5432/cognicity"
config.pg.table_tweets = 'tweet_reports';
config.pg.table_users = 'tweet_users';
config.pg.table_invitees = 'tweet_invitees';
config.pg.table_unconfirmed = 'tweet_reports_unconfirmed';
config.pg.table_nonspatial_users = 'nonspatial_tweet_users';
config.pg.table_nonspatial_tweet_reports = 'nonspatial_tweet_reports';
config.pg.table_all_users = 'all_users';

module.exports = config;
