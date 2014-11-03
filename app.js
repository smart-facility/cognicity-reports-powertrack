'use strict';

/* jshint node:true */
/* jshint unused:vars */ // We want to keep function parameters on callbacks like the originals
/* jshint curly:false */ // Don't require curly brackets around one-line statements

//app.js - cognicity-reports-powertrack modules

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

// Modules
/** ntwitter twitter interface module */
var twitter = require('ntwitter');
/** Gnip PowerTrack interface module */
var Gnip = require('gnip');
/** Postgres interface module */
var pg = require('pg');
/** Winston logger module */
var logger = require('winston');

// Verify expected arguments
if (process.argv[2]){
	var config = require(__dirname+'/'+process.argv[2]); 
} else {
	throw new Error('No config file. Usage: node app.js config.js');
}

// Logging configuration
logger
	// Configure custom File transport to write plain text messages
	.add(logger.transports.File, { 
		filename: __dirname+"/"+config.instance+".log", // Write to projectname.log
		json: false, // Write in plain text, not JSON
		maxsize: config.logger.maxFileSize, // Max size of each file
		maxFiles: config.logger.maxFiles, // Max number of files
		level: config.logger.level // Level of log messages
	})
	// Console transport is no use to us when running as a daemon
	.remove(logger.transports.Console);

// Verify DB connection is up
pg.connect(config.pg.conString, function(err, client, done){
	if (err){
		logger.error("DB Connection error: " + err);
		done();
		process.exit(1);
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
		process.exit(1);
	} else {
		logger.info("twit.verifyCredentials: Twitter credentials succesfully verified");
	}
});

/**
 * Resolve message code from config.twitter.
 * Will fall back to trying to resolve message using default language set in configuration.
 * @param {string} code Code to lookup in config.twitter 
 * @param {string} lang Language to lookup in config.twitter[code]
 * @returns {string} Message code, or null if not resolved.
 */
function getMessage(code, lang) {
	if (config.twitter[code]) {
		if (config.twitter[code][lang]) return config.twitter[code][lang];
		if (config.twitter[code][config.twitter.defaultLanguage]) return config.twitter[code][config.twitter.defaultLanguage];
	}
	
	logger.warn( "getMessage: Code could not be resolved for '" + code + "' and lang '" + lang +"'" );
	return null;
}

/**
 * DB query success callback
 * @callback dbQuerySuccess
 * @param {object} result The 'pg' module result object on a successful query
 */

/**
 * Execute the SQL against the database connection. Run the success callback on success if supplied.
 * @param {string} sql SQL script to execute in the DB. 
 * @param {dbQuerySuccess} success Callback function to execute on success.
 */
function dbQuery(sql, success){
	logger.debug( "dbQuery: executing SQL: " + sql );
	pg.connect(config.pg.conString, function(err, client, done){
		if (err){
			logger.error("dbQuery: " + sql + ", " + err);
			done();
			return;
		}	
		client.query(sql, function(err, result){
			if (err){
				logger.error("dbQuery: " + sql + ", " + err);
				done();
				return;
			}
			done();
			logger.debug( "dbQuery: success: " + sql );
			if (success) {
				try {
					success(result);
				} catch(error) {
					logger.error("dbQuery: Error in success callback: " + error.message + ", " + error.stack);
				}
			}
		});
	});
}

/**
 * Only execute the success callback if the user is not currently in the all users table.
 * @param {string} user The twitter screen name to check if exists
 * @param {dbQuerySuccess} callback Callback to execute if the user doesn't exist
 */
function ifNewUser(user, success){
	dbQuery(
		"SELECT a.user_hash FROM "+config.pg.table_all_users+" a WHERE a.user_hash = md5('"+user+"');",
		function(result) {
			if (result && result.rows && result.rows.length === 0) {
				success(result);
			} else {
				logger.debug("Not performing callback as user already exists");
			}
		}	
	);
}

/**
 * Send @reply Twitter message
 * @param {string} user The twitter screen name to send to
 * @param {string} message The tweet text to send
 * @param {function} callback Callback function called on success
 */
function sendReplyTweet(user, message, callback){
	ifNewUser( user, function(result) {
		if (config.twitter.send_enabled === true){
			twit.updateStatus('@'+user+' '+message, function(err, data){
				if (err) {
					logger.error('Tweeting failed: ' + err);
				} else {
					if (callback) callback();
				}
			});	
		} else { // for testing
			logger.info('sendReplyTweet is in test mode - no message will be sent. Callback will still run.');
			logger.info('@'+user+' '+message);
			if (callback) callback();
		}
	});
}

// TODO Dollar strings; if we get a tweet with $$ in the middle, exception? Can we use parameterized queries?

/**
 * Insert a confirmed report - i.e. has geo coordinates and is addressed.
 * Store both the tweet information and the user hash.
 * @param tweetActivity Gnip PowerTrack tweet activity object
 */
function insertConfirmed(tweetActivity){
	//insertUser with count -> upsert	
	dbQuery(
		"INSERT INTO " + config.pg.table_tweets + " (created_at, text, hashtags, urls, user_mentions, lang, the_geom) " +
		"VALUES (to_timestamp('" + new Date(Date.parse(tweetActivity.postedTime)).toLocaleString() + 
		"'::text, 'Dy Mon DD YYYY HH24:MI:SS +ZZZZ'), $$" + tweetActivity.body + "$$, '" +
		JSON.stringify(tweetActivity.twitter_entities.hashtags) + "', '" + 
		JSON.stringify(tweetActivity.twitter_entities.urls) + "', '" +
		JSON.stringify(tweetActivity.twitter_entities.user_mentions) + "', '" +
		tweetActivity.twitter_lang + "', ST_GeomFromText('POINT(" + tweetActivity.geo.coordinates[0] + " " + tweetActivity.geo.coordinates[1] + ")',4326));",
		function(result) {
			logger.info('Logged confirmed tweet report');
			dbQuery( 
				"SELECT upsert_tweet_users(md5('"+tweetActivity.actor.preferredUsername+"'));",
				function(result) {
					logger.info('Logged confirmed tweet user');
				}
			);
		}
	);
}

/**
 * Insert an invitee - i.e. a user we've invited to participate.
 * @param tweetActivity Gnip PowerTrack tweet activity object
 */
function insertInvitee(tweetActivity){
	dbQuery( 
		"INSERT INTO "+config.pg.table_invitees+" (user_hash) VALUES (md5('"+tweetActivity.actor.preferredUsername+"'));",
		function(result) {
			logger.info('Logged new invitee');
		}
	);
}
	
/**
 * Insert an unconfirmed report - i.e. has geo coordinates but is not addressed.
 * @param tweetActivity Gnip PowerTrack tweet activity object
 */
function insertUnConfirmed(tweetActivity){
	dbQuery(
		"INSERT INTO " + config.pg.table_unconfirmed + " (created_at, the_geom) VALUES (to_timestamp('" + 
		new Date(Date.parse(tweetActivity.postedTime)).toLocaleString() + 
		"'::text, 'Dy Mon DD YYYY HH24:MI:SS +ZZZZ'), ST_GeomFromText('POINT(" + 
		tweetActivity.geo.coordinates[0] + " " + tweetActivity.geo.coordinates[1] + ")',4326));",
		function(result) {
			logger.info('Logged unconfirmed tweet report');
		}
	);
}
	
/**
 * Insert a non-spatial tweet report - i.e. we got an addressed tweet without geo coordinates.
 * @param tweetActivity Gnip PowerTrack tweet activity object
 */
function insertNonSpatial(tweetActivity){
	dbQuery(
		"INSERT INTO " + config.pg.table_nonspatial_tweet_reports + 
		" (created_at, text, hashtags, urls, user_mentions, lang) VALUES (to_timestamp('" + 
		new Date(Date.parse(tweetActivity.postedTime)).toLocaleString() + 
		"'::text, 'Dy Mon DD YYYY H24:MI:SS +ZZZZ'), $$" + tweetActivity.body +	"$$, '" + 
		JSON.stringify(tweetActivity.twitter_entities.hashtags) + "','" +
		JSON.stringify(tweetActivity.twitter_entities.urls) + "','" + 
		JSON.stringify(tweetActivity.twitter_entities.user_mentions) + "','" + 
		tweetActivity.twitter_lang + "');",
		function(result) {
			logger.info('Inserted non-spatial tweet');
		}
	);
	
	ifNewUser( tweetActivity.actor.preferredUsername, function(result) {
		dbQuery( 
			"INSERT INTO "+config.pg.table_nonspatial_users+" (user_hash) VALUES (md5('"+tweetActivity.actor.preferredUsername+"'));",
			function(result) {
				logger.info("Inserted non-spatial user");
			}
		);
	});
}
	
/**
 * Main stream tweet filtering logic.
 * Filter the incoming tweet and decide what action needs to be taken:
 * confirmed report, ask for geo, ask user to participate, or nothing
 * @param tweetActivity The tweet activity from Gnip
 */
function filter(tweetActivity){
	logger.verbose( 'filter: Received tweetActivity: screen_name="' + tweetActivity.actor.preferredUsername + '", text="' + tweetActivity.body.replace("\n", "") + '", coordinates="' + (tweetActivity.geo && tweetActivity.geo.coordinates ? tweetActivity.geo.coordinates[0]+", "+tweetActivity.geo.coordinates[1] : 'N/A') + '"' );
	
	// Everything incoming has a keyword already, so we now try and categorize it using the Gnip tags
	var hasGeo = (tweetActivity.geo && tweetActivity.geo.coordinates);
	var geoInBoundingBox = false;
	var addressed = false;
	var locationMatch = false;
	
	tweetActivity.gnip.matching_rules.forEach( function(rule){
		if (rule.tag) {
			if (rule.tag.indexOf("geo")===0) geoInBoundingBox = true;
			if (rule.tag.indexOf("addressed")===0) addressed = true;
			if (rule.tag.indexOf("location")===0) locationMatch = true;
		}
	});
	logger.verbose("filter: Categorized tweetActivity via Gnip tags as " + (geoInBoundingBox?'+':'-') + "GEO " + (addressed?'+':'-') + "ADDRESSED " + (locationMatch?'+':'-') + "LOCATION");
	
	// Perform the actions for the categorization of the tween
	if ( geoInBoundingBox && addressed ) {
		logger.verbose( 'filter: +GEO +ADDRESSED = confirmed report' );
		insertConfirmed(tweetActivity); //user + geo = confirmed report!	
		
	} else if ( !geoInBoundingBox && addressed ) {
		logger.verbose( 'filter: -GEO +ADDRESSED = ask user for geo' );
		
		if (hasGeo) {
			logger.verbose( 'filter: Tweet has geo coordinates but did not match bounding box, not asking for geo' );
		} else {
			insertNonSpatial(tweetActivity); //User sent us a message but no geo, log as such
			sendReplyTweet( tweetActivity.actor.preferredUsername, getMessage('thanks_text', tweetActivity.twitter_lang) ); //send geo reminder
		}
		
	} else if ( geoInBoundingBox && !addressed ) {
		logger.verbose( 'filter: +GEO -ADDRESSED = unconfirmed report, ask user to participate' );

		insertUnConfirmed(tweetActivity); //insert unconfirmed report, then invite the user to participate
		sendReplyTweet(tweetActivity.actor.preferredUsername, getMessage('invite_text', tweetActivity.twitter_lang), function(){
			insertInvitee(tweetActivity);
		});	
		
	} else if ( !geoInBoundingBox && !addressed && locationMatch ) {
		logger.verbose( 'filter: -GEO -ADDRESSED +LOCATION = ask user to participate' );
		
		if (hasGeo) {
			logger.verbose( 'filter: Tweet has geo coordinates but did not match bounding box, not asking to participate' );
		} else {
			sendReplyTweet(tweetActivity.actor.preferredUsername, getMessage('invite_text', tweetActivity.twitter_lang), function(){
				insertInvitee(tweetActivity);
			});
		}
		
	} else {
		logger.warn( 'filter: Tweet did not match category actions' );
	}
}

/**
 * Connect the Gnip stream.
 * Establish the network connection, push rules to Gnip.
 * Setup error handlers and timeout handler.
 * Handle events from the stream on incoming data.
 */
function connectStream(){
	// Gnip stream
	var stream;
	// Timeout reconnection delay, used for exponential backoff
	var streamReconnectTimeout = 1;
	// Connect Gnip stream and setup event handlers
	var reconnectTimeoutHandle;

	// TODO Get backfill data on reconnect?
	// TODO Get replay data on reconnect?
	
	// Attempt to reconnect the socket. 
	// If we fail, wait an increasing amount of time before we try again.
	function reconnectSocket() {
		// Try and destroy the existing socket, if it exists
		logger.warn( 'connectStream: Connection lost, destroying socket' );
		if ( stream._req ) stream._req.destroy();
		// Attempt to reconnect
		logger.info( 'connectStream: Attempting to reconnect stream' );
		stream.start();
		streamReconnectTimeout *= 2;
		// TODO Set max timeout and notify if we hit it?
	}

	// TODO We get called twice for disconnect, once from error once from end
	// Is this normal? Can we only use one event? Or is it possible to get only
	// one of those handlers called under some error situations.
	
	// Attempt to reconnect the Gnip stream.
	// This function handles us getting called multiple times from different error handlers.
	function reconnectStream() {				
		if (reconnectTimeoutHandle) clearTimeout(reconnectTimeoutHandle);
		logger.info( 'connectStream: queing reconnect for ' + streamReconnectTimeout );
		reconnectTimeoutHandle = setTimeout( reconnectSocket, streamReconnectTimeout*1000 );
	}
	
	// Configure a Gnip stream with connection details
	stream = new Gnip.Stream({
	    url : config.gnip.steamUrl,
	    user : config.gnip.username,
	    password : config.gnip.password
	});
	
	// When stream is connected, setup the stream timeout handler
	stream.on('ready', function() {
		logger.info('connectStream: Stream ready!');
	    streamReconnectTimeout = 1;
		// Augment Gnip.Stream._req (Socket) object with a timeout handler.
		// We are accessing a private member here so updates to gnip could break this,
	    // but gnip module does not expose the socket or methods to handle timeout.
		stream._req.setTimeout( config.gnip.streamTimeout, function() {
			reconnectStream();
		});
	});

	// When we receive a tweetActivity from the Gnip stream this event handler will be called
	stream.on('tweet', function(tweetActivity) {
		logger.debug("connectStream: stream.on('tweet'): tweet = " + JSON.stringify(tweetActivity));
		
		// Catch errors here, otherwise error in filter method is caught as stream error
		try {
		    filter(tweetActivity);
		} catch (err) {
			logger.error("connectStream: stream.on('tweet'): Error on handler:" + err.message + ", " + err.stack);
		}
	});
	
	// Handle an error from the stream
	stream.on('error', function(err) {
		logger.error("connectStream: Error connecting stream:" + err);
		reconnectStream();
	});
	
	// TODO Do we need to catch the 'end' event?
	// Handle a socket 'end' event from the stream
	stream.on('end', function() {
		logger.error("connectStream: Stream ended");
		reconnectStream();
	});

	// Construct a Gnip rules connection
	var rules = new Gnip.Rules({
	    url : config.gnip.rulesUrl,
	    user : config.gnip.username,
	    password : config.gnip.password
	});
	
	// Create rules programatically from config
	// Use key of rule entry as the tag, and value as the rule string
	var newRules = [];
	for (var tag in config.gnip.rules) {
		if ( config.gnip.rules.hasOwnProperty(tag) ) {
			newRules.push({
				tag: tag,
				value: config.gnip.rules[tag]
			});
		}
	}
	logger.debug('connectStream: Rules = ' + JSON.stringify(newRules));
	
	// Push the parsed rules to Gnip
	logger.info('connectStream: Updating rules...');
	rules.update(newRules, function(err) {
	    if (err) throw err;
		logger.info('connectStream: Connecting stream...');
		// If we pushed the rules successfully, now try and connect the stream
		stream.start();
	});
	
}

// Catch unhandled exceptions, log, and exit with error status
process.on('uncaughtException', function (err) {
	logger.error('uncaughtException: ' + err.message + ", " + err.stack);
	process.exit(1);
});

// Catch kill signal and log a clean exit status
process.on('SIGTERM', function() {
	logger.info('SIGTERM: Application shutting down');
	process.exit(0);
});

// Start up the twitter feed - connect the Gnip stream
if ( config.gnip.stream ) connectStream();
