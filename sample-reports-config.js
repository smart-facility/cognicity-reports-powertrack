//sample-config.js - sample configuration file for cognicity-reports module

var config = {};

// Instance name - default name for this configuration (will be server process name)
config.instance = 'cognicity-reports';

//Twitter stream config
config.twitter = {};
config.twitter.stream = true; //Set to false to turn off twitter connection (for testing)
config.twitter.timeout = 900000; //Default twitter stream timeout (milliseconds) 600000 (10 minutes)

//Twitter app authentication details
config.twitter.consumer_key = '';
config.twitter.consumer_secret = '';
config.twitter.access_token_key = '';
config.twitter.access_token_secret = '';

//Twitter stream parameters
config.twitter.bbox = '106.5894, -6.4354, 107.0782, -5.9029'; // Jakarta appx.
config.twitter.track = 'flood, banjir'; //Twitter track keywords
config.twitter.city = 'jakarta'; //User profile location keyword
config.twitter.users = '@petajkt'; //Verification twitter account
config.twitter.send_enabled = false; //send verfication requests?
config.twitter.stream = true; //connect to stream and log reports?

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
