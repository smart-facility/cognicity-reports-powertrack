'use strict';

var PowertrackDataSource = require('./PowertrackDataSource');
var config = require('./sample-powertrack-config');

/**
 * The constructor function we expose takes a harvester and returns an instance of this
 * data source, with configuration already injected.
 */
var constructor = function( harvester ) {
	return new PowertrackDataSource( harvester, config );
};

module.exports = constructor;