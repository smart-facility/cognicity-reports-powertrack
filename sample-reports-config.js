'use strict';

//sample-config.js - sample configuration file for cognicity-reports module

/* jshint node:true */
/* global module */

var config = {};

// Instance name - default name for this configuration (will be server process name)
config.instance = 'cognicity-reports-powertrack';

//Logging configuration
config.logger = {};
config.logger.level = "info"; // What level to log at; info, verbose or debug are most useful. Levels are (npm defaults): silly, debug, verbose, info, warn, error.
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
config.gnip.streamTimeout = 1000 * 60; // In milliseconds. Must be >30s as a keep-alive is sent at least every 30s
config.gnip.username = 'username';
config.gnip.password = 'password';
config.gnip.steamUrl = 'https://stream.gnip.com:443/accounts/ACCOUNT_NAME/publishers/twitter/streams/track/prod.json?client=1'; // Append ?client=1 to use backfill
config.gnip.rulesUrl = 'https://api.gnip.com:443/accounts/ACCOUNT_NAME/publishers/twitter/streams/track/prod/rules.json';
config.gnip.rules = {
    "boundingbox":"( contains:flood OR contains:banjir ) ( bounding_box:[106.5894 -6.4354 106.799999999 -6.2] OR bounding_box:[106.8 -6.4354 107.0782 -6.2] OR bounding_box:[106.5894 -6.199999999 106.799999999 -5.9029] OR bounding_box:[106.8 -6.199999999 107.0782 -5.9029] )",
    "addressed":"( contains:flood OR contains:banjir ) @petajkt",
    "location":"( contains:flood OR contains:banjir ) ( bio_location_contains:jakarta OR place_contains:jakarta OR profile_bounding_box:[106.5894 -6.4354 106.799999999 -6.2] OR profile_bounding_box:[106.8 -6.4354 107.0782 -6.2] OR profile_bounding_box:[106.5894 -6.199999999 106.799999999 -5.9029] OR profile_bounding_box:[106.8 -6.199999999 107.0782 -5.9029] )"
};
config.gnip.maxReconnectTimeout = 1000 * 60 * 5; // In milliseconds; 5 minutes for max reconnection timeout - will mean ~10 minutes from first disconnection 
config.gnip.sendTweetOnMaxTimeoutTo = null; // Enter a twitter usernames here (without @, comma separated for multiples) to send a notification tweet if the max reconnection timeout is reached

//Twitter parameters
config.twitter.send_enabled = false; //send verfication requests?

// Twitter message texts
// Note we use IN and ID because twitter and Gnip return different language codes for Indonesian
// The messages should be no longer than 109 characters if timestamps are enabled, or 123 characters if timestamps are disabled
config.twitter.defaultLanguage = 'en';
config.twitter.invite_text = {
	'in' : 'Invite/Verification Tweet Text [IN]',
	'id' : 'Invite/Verification Tweet Text [ID]',
	'en' : 'Invite/Verification Tweet Text [EN]'
};
config.twitter.askforgeo_text = {
	'in' : 'Location-enabled reminder Tweet Text [IN]',
	'id' : 'Location-enabled reminder Tweet Text [ID]',
	'en' : 'Location-enabled reminder Tweet Text [EN]'
};
config.twitter.thanks_text = {
	'in' : 'Thank-you Tweet Text [IN]',
	'id' : 'Thank-you Tweet Text [ID]',
	'en' : 'Thank-you Tweet Text [EN]'
};
//Append a timestamp to each sent tweet
config.twitter.addTimestamp = true;

//Postgres database connection
config.pg = {};
config.pg.conString = "postgres://postgres:password@localhost:5432/cognicity";
config.pg.table_tweets = 'tweet_reports';
config.pg.table_users = 'tweet_users';
config.pg.table_invitees = 'tweet_invitees';
config.pg.table_unconfirmed = 'tweet_reports_unconfirmed';
config.pg.table_nonspatial_users = 'nonspatial_tweet_users';
config.pg.table_nonspatial_tweet_reports = 'nonspatial_tweet_reports';
config.pg.table_all_users = 'all_users';

module.exports = config;
