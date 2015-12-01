'use strict';

/**
 * @file Cognicity reports data module which retrieves tweet data from Gnip Powertrack
 * @copyright (c) Tomas Holderness & SMART Infrastructure Facility January 2014
 * @license Released under GNU GPLv3 License (see LICENSE.txt).
 * @example
 * Must be run as a subfolder of cognicity-reports, and 
 * cognicity-reports must be configured to use this datasource.
 */

var PowertrackDataSource = require('./PowertrackDataSource');
var config = require('./sample-powertrack-config');

// ntwitter twitter interface module
var Twitter = require('ntwitter');

/**
 * The constructor function we expose takes a reports object and returns an instance of this
 * data source, with configuration already injected.
 */
var constructor = function( reports ) {
	// Configure new instance of the ntwitter interface
	var twitter = new Twitter({
		consumer_key: config.twitter.consumer_key,
		consumer_secret: config.twitter.consumer_secret,
		access_token_key: config.twitter.access_token_key,
		access_token_secret: config.twitter.access_token_secret
	});
	
	return new PowertrackDataSource( reports, twitter, config );
};

module.exports = constructor;