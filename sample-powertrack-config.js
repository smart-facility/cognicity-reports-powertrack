'use strict';

// sample-powertrack-config.js - sample configuration file for cognicity-reports-powertrack module

/**
 * Configuration for cognicity-reports-powertrack
 * @namespace {object} config
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
 */
var config = {};

//Gnip Powertrack API
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
module.exports = config;
