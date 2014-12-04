'use strict';

// app.js - cognicity-reports-powertrack application setup

/**
 * @file Collect unconfirmed reports from Twitter & send report verification tweets
 * @copyright (c) Tomas Holderness & SMART Infrastructure Facility January 2014
 * @license Released under GNU GPLv3 License (see LICENSE.txt).
 * @example
 * Usage:	
 *     node daemon.js cognicity-reports-config.js start
 *     node daemon.js cognicity-reports-config.js status
 *     node daemon.js cognicity-reports-config.js stop
 */

// Node dependencies
var path = require('path');

// Modules
/** ntwitter twitter interface module */
var twitter = require('ntwitter');
/** Postgres interface module */
var pg = require('pg');
/** Winston logger module */
var logger = require('winston');
/** Gnip PowerTrack interface module */
var Gnip = require('gnip');

/** 
 * CognicityReportsPowertrack interface module
 * @type {CognicityReportsPowertrack}
 */
var cognicityReportsPowertrack = require('./CognicityReportsPowertrack.js');

// Verify expected arguments
if (process.argv[2]) {
	var config = require( __dirname + path.sep + process.argv[2] ); 
} else {
	throw new Error('No config file. Usage: node app.js config.js');
}

// Logging configuration
var logPath = ( config.logger.logDirectory ? config.logger.logDirectory : __dirname );
logPath += path.sep;
logPath += config.instance + ".log";

logger
	// Configure custom File transport to write plain text messages
	.add(logger.transports.File, { 
		filename: logPath, // Write to projectname.log
		json: false, // Write in plain text, not JSON
		maxsize: config.logger.maxFileSize, // Max size of each file
		maxFiles: config.logger.maxFiles, // Max number of files
		level: config.logger.level // Level of log messages
	})
	// Console transport is no use to us when running as a daemon
	.remove(logger.transports.Console);

// FIXME This is a workaround for https://github.com/flatiron/winston/issues/228
// If we exit immediately winston does not get a chance to write the last log message.
// So we wait a short time before exiting.
function exitWithStatus(exitStatus) {
	logger.info( "Exiting with status " + exitStatus );
	setTimeout( function() {
		process.exit(exitStatus);
	}, 500 );
}

logger.info("Application starting...");

// Verify DB connection is up
pg.connect(config.pg.conString, function(err, client, done){
	if (err){
		logger.error("DB Connection error: " + err);
		logger.error("Fatal error: Application shutting down");
		done();
		exitWithStatus(1);
	}
});

// Configure new instance of the ntwitter interface
/** ntwitter interface instance */
var twit = new twitter({
	consumer_key: config.twitter.consumer_key,
	consumer_secret: config.twitter.consumer_secret,
	access_token_key: config.twitter.access_token_key,
	access_token_secret: config.twitter.access_token_secret
});

// Verify that the twitter connection was successful, fail if not
twit.verifyCredentials(function (err, data) {
	if (err) {
		logger.error("twit.verifyCredentials: Error verifying credentials: " + err);
		logger.error("Fatal error: Application shutting down");
		exitWithStatus(1);
	} else {
		logger.info("twit.verifyCredentials: Twitter credentials succesfully verified");
	}
});

// Construct new instance of the cognicity module,
// passing in the configuration and pre-configured instances
// of other modules
var server = new cognicityReportsPowertrack(
	config,
	twit,
	pg,
	logger,
	Gnip
);

// Handle postgres idle connection error
pg.on('error', function(err) {
	logger.error('Postgres connection error: ' + err);
	
	logger.info('Enabling caching mode and attempting to reconnect at intervals');
	server.enableCacheMode();
	
	var reconnectionAttempts = 0;
	var reconnectionFunction = function() {
		// Try and reconnect
		pg.connect(config.pg.conString, function(err, client, done){
			if (err) {
				reconnectionAttempts++;
				if (reconnectionAttempts >= config.pg.reconnectionAttempts) {
					// We have tried the maximum number of times, tweet admin and exit in failure state
					logger.error( 'Postgres reconnection failed' );
					logger.error( 'Maximum reconnection attempts reached, exiting' );
					server.tweetAdmin( 'Postgres connection cannot be re-established', function() {
						exitWithStatus(1);
					});
				} else {
					// If we failed, try and reconnect again after a delay
					logger.error( 'Postgres reconnection failed, queuing next attempt for ' + config.pg.reconnectionDelay + 'ms' );
					setTimeout( reconnectionFunction, config.pg.reconnectionDelay );
				}
			} else {
				// If we succeeded, disable harvester caching mode
				logger.info( 'Postgres reconnection succeeded, re-enabling real time processing' );
				server.disableCacheMode();
			}
		});			
	};
	
	reconnectionFunction();
});

// Catch unhandled exceptions, log, and exit with error status
process.on('uncaughtException', function (err) {
	logger.error('uncaughtException: ' + err.message + ", " + err.stack);
	logger.error("Fatal error: Application shutting down");
	exitWithStatus(1);
});

// Catch kill and interrupt signals and log a clean exit status
process.on('SIGTERM', function() {
	logger.info('SIGTERM: Application shutting down');
	exitWithStatus(0);
});
process.on('SIGINT', function() {
	logger.info('SIGINT: Application shutting down');
	exitWithStatus(0);
});

// Start up the twitter feed - connect the Gnip stream
if ( config.gnip.stream ) server.connectStream();
