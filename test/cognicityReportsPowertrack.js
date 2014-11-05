'use strict';

/* jshint node:true */
/* jshint unused:vars */ // We want to keep function parameters on callbacks like the originals
/* jshint curly:false */ // Don't require curly brackets around one-line statements

/* jshint -W079 */
var test = require('unit.js');
/* jshint +W079 */
var CognicityReportsPowertrack = require('../CognicityReportsPowertrack.js');

// Create server and mock functions as required
var server = new CognicityReportsPowertrack(
	{},
	{},
	{},
	{ // Logger
		warn:function(){}
	}
);

// Test harness for CognicityReportsPowertrack object
describe( 'CognicityReportsPowertrack', function() {
	
	// Test suite for i18n getMessage function
	describe( 'i18n', function() {
		// Setup by adding some codes and a defaultLanguage to the config
		before( function() {
			server.config = {
				'twitter' : {
					'foo' : {
						'az' : 'bar',
						'en' : 'gum'
					},
					'defaultLanguage' : 'en'
				}
			};
		});
		
		it( 'Should resolve a string for specified language', function() {
			test.string( server.getMessage('foo', 'az') ).is( 'bar' );
		});
		it( 'Should resolve a string for default language', function() {
			test.string( server.getMessage('foo', 'does-not-exist') ).is( 'gum' );
		});
		it( 'Should return null if code cannot be resolved', function() {
			test.value( server.getMessage('does-not-exist', 'en') ).is( null );
		});
	});
	
});