'use strict';

// sample-powertrack-config.js - sample configuration file for cognicity-reports-powertrack module

/**
 * Configuration for cognicity-reports-powertrack
 * @namespace {object} config
 * @property {object} pg Postgres configuration object
 * @property {string} pg.table_all_reports Postgres table name for normalised report data
 * @property {string} pg.table_tweets Postgres table name for tweet records
 * @property {string} pg.table_users Postgres table name for user records
 * @property {string} pg.table_invitees Postgres table name for invited user records
 * @property {string} pg.table_unconfirmed Postgres table name for unconfirmed reports
 * @property {string} pg.table_nonspatial_users Postgres table name for non-spatial users
 * @property {string} pg.table_nonspatial_tweet_reports Postgres table name for non-spatial tweet reports
 * @property {string} pg.table_all_users Postgres table name for all user records
 * @property {object} gnip Configuration object for Gnip PowerTrack interface
 * @property {boolean} gnip.stream If true, connect to the Gnip stream and process tweets
 * @property {number} gnip.streamTimeout Network timeout for Gnip stream connection, in milliseconds. Must be >30s as a keep-alive is sent at least every 30s. {@link http://support.gnip.com/apis/consuming_streaming_data.html#keepalive_signals}
 * @property {string} gnip.username Username for Gnip PowerTrack
 * @property {string} gnip.password Password for Gnip PowerTrack
 * @property {string} gnip.streamUrl URL for Gnip PowerTrack stream, take from the PowerTrack admin interface. Append '?client=1' to use backfill. {@link http://support.gnip.com/apis/consuming_streaming_data.html#Backfill}
 * @property {string} gnip.rulesUrl URL for the Gnip PowerTrack rules interface, take from the PowerTrack admin interface.
 * @property {object} gnip.rules Object of Gnip rules mapping rule names to rule text
 * @property {string} gnip.rules.(name) Rule name
 * @property {string} gnip.rules.(value) Rule text
 * @property {number} gnip.maxReconnectTimeout Maximum reconnection delay in milliseconds. Exponential backoff strategy is used starting at 1000 and will stop growing at this value.
 * @property {object} twitter Configuration object for Twitter interface
 * @property {object} twitter.usernameVerify Twitter username (without @) authorised to verify reports via retweet functionality
 * @property {string} twitter.usernameReplyBlacklist Twitter usernames (without @, comma separated for multiples) which will never be responded to as part of tweet processing
 * @property {string} twitter.consumer_key Take from the twitter dev admin interface
 * @property {string} twitter.consumer_secret Take from the twitter dev admin interface
 * @property {string} twitter.access_token_key Take from the twitter dev admin interface
 * @property {string} twitter.access_token_secret Take from the twitter dev admin interface
 * @property {boolen} twitter.send_enabled If true, send tweets to users asking them to verify their reports
 * @property {number} twitter.url_length Length that URLs in tweets are shortened to
 * @property {string} twitter.defaultLanguage The default language code to use if we can't resolve one from the tweet
 * @property {object} twitter.invite_text Object of twitter message texts mapping a language code to a message
 * @property {string} twitter.invite_text.(name) Language code to resolve
 * @property {string} twitter.invite_text.(value) Message to be tweeted
 * @property {object} twitter.askforgeo_text Object of twitter message texts mapping a language code to a message
 * @property {string} twitter.askforgeo_text.(name) Language code to resolve
 * @property {string} twitter.askforgeo_text.(value) Message to be tweeted
 * @property {object} twitter.thanks_text Object of twitter message texts mapping a language code to a message
 * @property {string} twitter.thanks_text.(name) Language code to resolve
 * @property {string} twitter.thanks_text.(value) Message to be tweeted
 * @property {boolean} twitter.addTimestamp If true, append a timestamp to each sent tweet
 */
var config = {};

//Database tables
config.pg = {};
config.pg.all_reports = 'all_reports';
config.pg.table_tweets = 'tweet_reports';
config.pg.table_users = 'tweet_users';
config.pg.table_invitees = 'tweet_invitees';
config.pg.table_unconfirmed = 'tweet_reports_unconfirmed';
config.pg.table_nonspatial_users = 'nonspatial_tweet_users';
config.pg.table_nonspatial_tweet_reports = 'nonspatial_tweet_reports';
config.pg.table_all_users = 'tweet_all_users';

// Gnip Powertrack API
config.gnip = {};
config.gnip.stream = true; // Connect to stream and log reports
config.gnip.streamTimeout = 1000 * 60; // In milliseconds. Must be >30s as a keep-alive is sent at least every 30s
config.gnip.username = 'USERNAME'; // Gnip username
config.gnip.password = 'PASSWORD'; // Gnip password
config.gnip.streamUrl = 'https://stream.gnip.com:443/accounts/ACCOUNT_NAME/publishers/twitter/streams/track/prod.json?client=1'; // Gnip stream URL, take from the Gnip admin interface. Append ?client=1 to use backfill
config.gnip.rulesUrl = 'https://api.gnip.com:443/accounts/ACCOUNT_NAME/publishers/twitter/streams/track/prod/rules.json'; // Gnip rules URL, take from the Gnip admin interface.
// Gnip rules, enter as an object where the key is the rule name and the value is the rule as a string
config.gnip.rules = {
    "boundingbox":"( contains:flood OR contains:banjir OR contains:jakartabanjir ) ( bounding_box:[106.5894 -6.4354 106.799999999 -6.2] OR bounding_box:[106.8 -6.4354 107.0782 -6.2] OR bounding_box:[106.5894 -6.199999999 106.799999999 -5.9029] OR bounding_box:[106.8 -6.199999999 107.0782 -5.9029] )",
    "addressed":"( contains:flood OR contains:banjir OR contains:jakartabanjir ) @petajkt",
    "location":"( contains:flood OR contains:banjir OR contains:jakartabanjir ) ( bio_location_contains:jakarta OR place_contains:jakarta OR profile_bounding_box:[106.5894 -6.4354 106.799999999 -6.2] OR profile_bounding_box:[106.8 -6.4354 107.0782 -6.2] OR profile_bounding_box:[106.5894 -6.199999999 106.799999999 -5.9029] OR profile_bounding_box:[106.8 -6.199999999 107.0782 -5.9029] )"
};
config.gnip.maxReconnectTimeout = 1000 * 60 * 5; // In milliseconds; 5 minutes for max reconnection timeout - will mean ~10 minutes from first disconnection

// Twitter app authentication details
config.twitter = {};
config.twitter.usernameVerify = ''; // Twitter username (without @) authorised to verify reports via retweet functionality
config.twitter.usernameReplyBlacklist = ''; // Twitter usernames (without @, comma separated for multiples) which will never be sent to in response to tweet processing
config.twitter.consumer_key = ''; // Take from the twitter dev admin interface
config.twitter.consumer_secret = ''; // Take from the twitter dev admin interface
config.twitter.access_token_key = ''; // Take from the twitter dev admin interface
config.twitter.access_token_secret = ''; // Take from the twitter dev admin interface

// Twitter parameters
config.twitter.send_enabled = false; // Enable sending of tweets?
config.twitter.url_length = 0; // URLs no longer count as part of tweet limits so this should be 0

// Twitter message texts
// Note we use IN and ID because twitter and Gnip return different language codes for Indonesian
// The messages should be no longer than 109 characters if timestamps are enabled, or 123 characters if timestamps are disabled
config.twitter.defaultLanguage = 'en'; // The default language code to use if we can't resolve one from the tweet
// Message codes. The name of the object (config.twitter.foo) is the name of the message type, that object should contain key value pairs
// where the key is the language code to resolve and the value is the message as a string.
// Note we have both ID and IN for indonesian
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
// Append a timestamp to each sent tweet except response to confirmed reports with unique urls
config.twitter.addTimestamp = true;

// Export config object
module.exports = config;
