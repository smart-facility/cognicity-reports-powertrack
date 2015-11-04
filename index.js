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

/**
 * The constructor function we expose takes a reports object and returns an instance of this
 * data source, with configuration already injected.
 */
var constructor = function( reports ) {
	return new PowertrackDataSource( reports, config );
};

module.exports = constructor;