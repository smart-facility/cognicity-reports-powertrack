'use strict';

/**
 * The Gnip Powertrack data source.
 * Connect to the Gnip Powertrack stream and process matching tweet data.
 * @constructor
 * @param {Reports} reports An instance of the reports object.
 * @param {object} twitter Configured instance of twitter object from ntwitter module
 * @param {object} config Gnip powertrack specific configuration.
 */
var PowertrackDataSource = function PowertrackDataSource(
		reports,
		twitter,
		config
	){

	// Store references to constructor arguments
	this.reports = reports;
	this.logger = reports.logger;
	this.twitter = twitter;
	this.config = config;

	// Gnip PowerTrack interface module
	this.Gnip = require('gnip');

	// Set constructor reference (used to print the name of this data source)
	this.constructor = PowertrackDataSource;
};

PowertrackDataSource.prototype = {

	/**
	 * Instance of Gnip object from Gnip module
	 * @type {object}
	 */
	Gnip: null,

	/**
	 * Data source configuration.
	 * This contains the data source specific configuration.
	 * @type {object}
	 */
	config: {},

	/**
	 * Instance of the reports module that the data source uses to interact with Cognicity Server.
	 * @type {Reports}
	 */
	reports: null,
	
	/**
	 * Configured instance of twitter object from ntwitter module
	 * @type {object}
	 */
	twitter: null,

	/**
	 * Instance of the Winston logger.
	 */
	logger: null,

	/**
	 * Flag signifying if we are currently able to process incoming data immediately.
	 * Turned on if the database is temporarily offline so we can cache for a short time.
	 * @type {boolean}
	 */
	_cacheMode: false,

	/**
	 * Store data if we cannot process immediately, for later processing.
	 * @type {Array}
	 */
	_cachedData: [],

	/**
	 * Resolve message code from config.twitter using passed language codes.
	 * Will fall back to trying to resolve message using default language set in configuration.
	 * @param {string} code Message code to lookup in config.twitter
	 * @param {GnipTweetActivity} tweetActivity Tweet activity object; check twitter language code and Gnip language codes for a match
	 * @returns {?string} Message text, or null if not resolved.
	 */
	_getMessage: function(code, tweetActivity) {
		var self = this;

		// Fetch the language codes from both twitter and Gnip data, if present
		var langs = [];
		if (tweetActivity.twitter_lang) langs.push(tweetActivity.twitter_lang);
		if (tweetActivity.gnip && tweetActivity.gnip.language && tweetActivity.gnip.language.value) langs.push(tweetActivity.gnip.language.value);

		// Find a matching code if we can
		if (self.config.twitter[code]) {
			for (var i=0; i<langs.length; i++) {
				var lang = langs[i];
				if (self.config.twitter[code][lang]) return self.config.twitter[code][lang];
			}
			// If we haven't found a code, try the default language
			if (self.config.twitter[code][self.config.twitter.defaultLanguage]) return self.config.twitter[code][self.config.twitter.defaultLanguage];
		}

		self.logger.warn( "_getMessage: Code could not be resolved for '" + code + "' and langs '" + langs +"'" );
		return null;
	},

	/**
	 * Gnip PowerTrack Tweet Activity object.
	 * @see {@link http://support.gnip.com/sources/twitter/data_format.html}
	 * @typedef GnipTweetActivity
	 */

	/**
	 * Main stream tweet filtering logic.
	 * Filter the incoming tweet and decide what action needs to be taken:
	 * confirmed report, ask for geo, ask user to participate, or nothing
	 * @param {GnipTweetActivity} tweetActivity The tweet activity from Gnip
	 */
	filter: function(tweetActivity) {
		var self = this;

		self.logger.verbose( 'filter: Received tweetActivity: screen_name="' + tweetActivity.actor.preferredUsername + '", text="' + tweetActivity.body.replace("\n", "") + '", coordinates="' + (tweetActivity.geo && tweetActivity.geo.coordinates ? tweetActivity.geo.coordinates[1]+", "+tweetActivity.geo.coordinates[0] : 'N/A') + '"' );

		// Catch tweets from authorised user to verification
		if ( tweetActivity.actor.preferredUsername === self.config.twitter.usernameVerify && tweetActivity.verb === 'share') {
			self._processVerifiedReport(tweetActivity.object.id.split(',')[1].split(':')[1]);
		}

		// Everything incoming has a keyword already, so we now try and categorize it using the Gnip tags
		var hasGeo = (tweetActivity.geo && tweetActivity.geo.coordinates);
		var geoInBoundingBox = false;
		var addressed = false;
		var locationMatch = false;

		tweetActivity.gnip.matching_rules.forEach( function(rule){
			if (rule.tag) {
				// Only set geoInBoundingBox to true if the user has tweet coordinates as well as matching the rule,
				// as the rule can match on 'place' being within the bounding box
				if (rule.tag.indexOf("boundingbox")===0 && hasGeo) geoInBoundingBox = true;
				if (rule.tag.indexOf("addressed")===0) addressed = true;
				if (rule.tag.indexOf("location")===0) locationMatch = true;
			}
		});
		var tweetCategorizations = (geoInBoundingBox?'+':'-') + "BOUNDINGBOX " +
			(hasGeo?'+':'-') + "GEO " +
			(addressed?'+':'-') + "ADDRESSED " +
			(locationMatch?'+':'-') + "LOCATION";

		self.logger.verbose("filter: Categorized tweetActivity via Gnip tags as " + tweetCategorizations);

		// Perform the actions for the categorization of the tweet
		if ( geoInBoundingBox && addressed ) {
			self.logger.verbose( 'filter: +BOUNDINGBOX +ADDRESSED = confirmed report' );

			self._insertConfirmed(tweetActivity); //user + geo = confirmed report!

		} else if ( geoInBoundingBox && !addressed ) {
			self.logger.verbose( 'filter: +BOUNDINGBOX -ADDRESSED = unconfirmed report, ask user to participate' );

			self._insertUnConfirmed(tweetActivity); //insert unconfirmed report

			// If we haven't contacted the user before, send them an invite tweet
			self._ifNewUser( tweetActivity.actor.preferredUsername, function(result) {
				self._sendReplyTweet(tweetActivity, self._getMessage('invite_text', tweetActivity), self.config.twitter.addTimestamp, function(){
					self._insertInvitee(tweetActivity);
				});
			});

		} else if ( !geoInBoundingBox && !hasGeo && locationMatch && addressed ) {
			self.logger.verbose( 'filter: -BOUNDINGBOX -GEO +ADDRESSED +LOCATION = ask user for geo' );

			self._insertNonSpatial(tweetActivity); //User sent us a message but no geo, log as such

			// Ask them to enable geo-location
			self._sendReplyTweet( tweetActivity, self._getMessage('askforgeo_text', tweetActivity), self.config.twitter.addTimestamp );

		} else if ( !geoInBoundingBox && !hasGeo && locationMatch && !addressed ) {
			self.logger.verbose( 'filter: -BOUNDINGBOX -GEO -ADDRESSED +LOCATION = ask user to participate' );

			// If we haven't contacted the user beforem, send them an invite tweet
			self._ifNewUser( tweetActivity.actor.preferredUsername, function(result) {
				self._sendReplyTweet(tweetActivity, self._getMessage('invite_text', tweetActivity), self.config.twitter.addTimestamp, function(){
					self._insertInvitee(tweetActivity);
				});
			});

		} else {
			// Not in bounding box but has geocoordinates or no location match
			self.logger.warn( 'filter: Tweet did not match category actions: ' + tweetCategorizations );
		}

	},

	/**
	 * Connect the Gnip stream.
	 * Establish the network connection, push rules to Gnip.
	 * Setup error handlers and timeout handler.
	 * Handle events from the stream on incoming data.
	 */
	start: function(){
		var self = this;

		// Gnip stream
		var stream;
		// Timeout reconnection delay, used for exponential backoff
		var _initialStreamReconnectTimeout = 1000;
		var streamReconnectTimeout = _initialStreamReconnectTimeout;
		// Connect Gnip stream and setup event handlers
		var reconnectTimeoutHandle;
		// Send a notification on an extended disconnection
		var disconnectionNotificationSent = false;

		// Attempt to reconnect the socket.
		// If we fail, wait an increasing amount of time before we try again.
		function reconnectSocket() {
			// Try and destroy the existing socket, if it exists
			self.logger.warn( 'connectStream: Connection lost, destroying socket' );
			if ( stream._req ) stream._req.destroy();

			// If our timeout is above the max threshold, cap it and send a notification tweet
			if (streamReconnectTimeout >= self.config.gnip.maxReconnectTimeout) {
				// Only send the notification once per disconnection
				if (!disconnectionNotificationSent) {
					var message = "Cognicity Reports PowerTrack Gnip connection has been offline for " +
						self.config.gnip.maxReconnectTimeout + " seconds";
					self.reports.tweetAdmin(message);
					disconnectionNotificationSent = true;
				}
			} else {
				streamReconnectTimeout *= 2;
				if (streamReconnectTimeout >= self.config.gnip.maxReconnectTimeout) streamReconnectTimeout = self.config.gnip.maxReconnectTimeout;
			}

			// Attempt to reconnect
			self.logger.info( 'connectStream: Attempting to reconnect stream' );
			stream.start();
		}

		// TODO We get called twice for disconnect, once from error once from end
		// Is this normal? Can we only use one event? Or is it possible to get only
		// one of those handlers called under some error situations.

		// Attempt to reconnect the Gnip stream.
		// This function handles us getting called multiple times from different error handlers.
		function reconnectStream() {
			if (reconnectTimeoutHandle) clearTimeout(reconnectTimeoutHandle);
			self.logger.info( 'connectStream: queing reconnect for ' + streamReconnectTimeout );
			reconnectTimeoutHandle = setTimeout( reconnectSocket, streamReconnectTimeout );
		}

		// Configure a Gnip stream with connection details
		stream = new self.Gnip.Stream({
		    url : self.config.gnip.streamUrl,
		    user : self.config.gnip.username,
		    password : self.config.gnip.password
		});

		// When stream is connected, setup the stream timeout handler
		stream.on('ready', function() {
			self.logger.info('connectStream: Stream ready!');
		    streamReconnectTimeout = _initialStreamReconnectTimeout;
		    disconnectionNotificationSent = false;
			// Augment Gnip.Stream._req (Socket) object with a timeout handler.
			// We are accessing a private member here so updates to gnip could break this,
		    // but gnip module does not expose the socket or methods to handle timeout.
			stream._req.setTimeout( self.config.gnip.streamTimeout, function() {
				self.logger.error('connectStream: Timeout error on Gnip stream');
				reconnectStream();
			});
		});

		// When we receive a tweetActivity from the Gnip stream this event handler will be called
		stream.on('tweet', function(tweetActivity) {
			if (self._cacheMode) {
				self.logger.debug( "connectStream: caching incoming tweet for later processing (id=" + tweetActivity.id + ")" );
				self._cachedData.push( tweetActivity );
			} else {
				self.logger.debug("connectStream: stream.on('tweet'): tweet = " + JSON.stringify(tweetActivity));

				// Catch errors here, otherwise error in filter method is caught as stream error
				try {
					if (tweetActivity.actor) {
						// This looks like a tweet in Gnip activity format
						self.filter(tweetActivity);
					} else {
						// This looks like a system message
						self.log.info("connectStream: Received system message: " + JSON.stringify(tweetActivity));
					}
				} catch (err) {
					self.logger.error("connectStream: stream.on('tweet'): Error on handler:" + err.message + ", " + err.stack);
				}
			}
		});

		// Handle an error from the stream
		stream.on('error', function(err) {
			self.logger.error("connectStream: Error connecting stream:" + err);
			reconnectStream();
		});

		// TODO Do we need to catch the 'end' event?
		// Handle a socket 'end' event from the stream
		stream.on('end', function() {
			self.logger.error("connectStream: Stream ended");
			reconnectStream();
		});

		// Construct a Gnip rules connection
		var rules = new self.Gnip.Rules({
		    url : self.config.gnip.rulesUrl,
		    user : self.config.gnip.username,
		    password : self.config.gnip.password
		});

		// Create rules programatically from config
		// Use key of rule entry as the tag, and value as the rule string
		var newRules = [];
		for (var tag in self.config.gnip.rules) {
			if ( self.config.gnip.rules.hasOwnProperty(tag) ) {
				newRules.push({
					tag: tag,
					value: self.config.gnip.rules[tag]
				});
			}
		}
		self.logger.debug('connectStream: Rules = ' + JSON.stringify(newRules));

		// Push the parsed rules to Gnip
		self.logger.info('connectStream: Updating rules...');
		// Bypass the cache, remove all the rules and send them all again
		rules.live.update(newRules, function(err) {
		    if (err) throw err;
			self.logger.info('connectStream: Connecting stream...');
			// If we pushed the rules successfully, now try and connect the stream
			stream.start();
		});

	},

	/**
	 * Only execute the success callback if the user is not currently in the all users table.
	 * @param {string} user The twitter screen name to check if exists
	 * @param {DbQuerySuccess} callback Callback to execute if the user doesn't exist
	 */
	_ifNewUser: function(user, success){
		var self = this;

		self.reports.dbQuery(
			{
				text: "SELECT user_hash FROM " + self.config.pg.table_all_users + " WHERE user_hash = md5($1);",
				values: [ user ]
			},
			function(result) {
				if (result && result.rows && result.rows.length === 0) {
					success(result);
				} else {
					self.logger.debug("Not performing callback as user already exists");
				}
			}
		);
	},

	/**
	 * Update a report status to verified if a matching tweet_id is found in the tweet_reports table
	 * @param {integer} retweet_id The retweeted twitter ID which may be a confirmed report
	 */
	_processVerifiedReport: function(retweet_id){
		var self = this;
		// Check to see if the referenced report is confirmed
		self.reports.dbQuery(
			{
				text: "SELECT pkey FROM " + self.config.pg.table_tweets + " WHERE tweet_id = $1;",
				values : [retweet_id]
			},
			// Update status
			function(result) {
				if (result && result.rows && result.rows.length === 1 && result.rows[0]) {
					self.reports.dbQuery(
						{
							text : "UPDATE " + self.config.pg.table_all_reports + " " +
								"SET STATUS = 'verified' WHERE fkey = $1 AND source = 'twitter';",
							values : [
								result.rows[0].pkey
							]
						},
						function(result) {
							self.logger.info('Logged verified tweet report');
						}
					);
				}
					else {
						self.logger.debug("Not performing callback as tweet not found in database");
				}
			}
		);
	},

	/**
	 * Send @reply Twitter message
	 * @param {GnipTweetActivity} tweetActivity The Gnip tweet activity object this is a reply to
	 * @param {string} message The tweet text to send
	 * @param {boolean} send with timestamp toggle
	 * @param {function} success Callback function called on success
	 */
	_sendReplyTweet: function(tweetActivity, message, addTimestamp, success) {
		var self = this;

		var usernameInBlacklist = false;
		if (self.config.twitter.usernameReplyBlacklist) {
			self.config.twitter.usernameReplyBlacklist.split(",").forEach( function(blacklistUsername){
				if ( tweetActivity.actor.preferredUsername === blacklistUsername.trim() ) usernameInBlacklist = true;
			});
		}

		if ( usernameInBlacklist ) {
			// Never send tweets to usernames in blacklist
			self.logger.info( '_sendReplyTweet: Tweet user is in usernameReplyBlacklist, not sending' );
		} else {
			// Tweet is not to ourself, attempt to send
			var originalTweetId = tweetActivity.id;
			originalTweetId = originalTweetId.split(':');
			originalTweetId = originalTweetId[originalTweetId.length-1];

			var params = {};
			params.in_reply_to_status_id = originalTweetId;

			message = '@' + tweetActivity.actor.preferredUsername + ' ' + message;
			if ( addTimestamp ) message = message + " " + new Date().getTime();

			if (self.config.twitter.send_enabled === true){
				self.twitter.updateStatus(message, params, function(err, data){
					if (err) {
						self.logger.error( 'Tweeting "' + message + '" with params "' + JSON.stringify(params) + '" failed: ' + err );
					} else {
						self.logger.debug( 'Sent tweet: "' + message + '" with params ' + JSON.stringify(params) );
						if (success) success();
					}
				});
			} else { // for testing
				self.logger.info( '_sendReplyTweet: In test mode - no message will be sent. Callback will still run.' );
				self.logger.info( '_sendReplyTweet: Would have tweeted: "' + message + '" with params ' + JSON.stringify(params) );
				if (success) success();
			}
		}
	},

	/**
	 * Insert a confirmed report - i.e. has geo coordinates and is addressed.
	 * Store both the tweet information and the user hash.
	 * @param {GnipTweetActivity} tweetActivity Gnip PowerTrack tweet activity object
	 */
	_insertConfirmed: function(tweetActivity) {
		var self = this;

		//insertUser with count -> upsert
		self.reports.dbQuery(
			{
				text : "INSERT INTO " + self.config.pg.table_tweets + " " +
					"(created_at, text, hashtags, text_urls, user_mentions, lang, url, tweet_id, the_geom) " +
					"VALUES (" +
					"$1, " +
					"$2, " +
					"$3, " +
					"$4, " +
					"$5, " +
					"$6, " +
					"$7, " +
					"$8, " +
					"ST_GeomFromText('POINT(' || $9 || ')',4326)" +
					") RETURNING pkey;",
				values : [
				    tweetActivity.postedTime,
				    tweetActivity.body,
				    JSON.stringify(tweetActivity.twitter_entities.hashtags),
				    JSON.stringify(tweetActivity.twitter_entities.urls),
				    JSON.stringify(tweetActivity.twitter_entities.user_mentions),
				    tweetActivity.twitter_lang,
						tweetActivity.link,
						tweetActivity.id.split(',')[1].split(':')[1], // get tweet id
				    tweetActivity.geo.coordinates[1] + " " + tweetActivity.geo.coordinates[0]
				]
			},
			function(result) {
				var report_id_foreign_key = result.rows[0].pkey; // primary key for tweet reports = foreign key for all_reports table
				self.logger.info('Logged confirmed tweet report');
				self.reports.dbQuery(
					{
						text : "SELECT upsert_tweet_users(md5($1));",
						values : [
						    tweetActivity.actor.preferredUsername
						]
					},
					function(result) {
						self.logger.info('Logged confirmed tweet user');
						self.reports.dbQuery(
							{
								text: "SELECT pkey FROM "+self.config.pg.table_all_reports+" WHERE fkey = $1 AND source = 'twitter';",
								values : [
									report_id_foreign_key
								]
							},
							function(result) {
									self.logger.info('Logged confirmed tweet user');
									// Get correct response message
									var message = self._getMessage('thanks_text', tweetActivity);
									// Append ID of user's report
									message+=result.rows[0].pkey;
									// Send the user a thank-you tweet; send this for every confirmed report, timestamp not needed because of unique url
									self._sendReplyTweet( tweetActivity, message, self.config.twitter.addTimestamp );
								}
							);
						}
					);
				}
		);
	},

	/**
	 * Insert an invitee - i.e. a user we've invited to participate.
	 * @param {GnipTweetActivity} tweetActivity Gnip PowerTrack tweet activity object
	 */
	_insertInvitee: function(tweetActivity){
		var self = this;

		self.reports.dbQuery(
			{
				text : "INSERT INTO " + self.config.pg.table_invitees + " (user_hash) VALUES (md5($1));",
				values : [ tweetActivity.actor.preferredUsername ]
			},
			function(result) {
				self.logger.info('Logged new invitee');
			}
		);
	},

	/**
	 * Insert an unconfirmed report - i.e. has geo coordinates but is not addressed.
	 * @param {GnipTweetActivity} tweetActivity Gnip PowerTrack tweet activity object
	 */
	_insertUnConfirmed: function(tweetActivity){
		var self = this;

		self.reports.dbQuery(
			{
				text : "INSERT INTO " + self.config.pg.table_unconfirmed + " " +
					"(created_at, the_geom) " +
					"VALUES ( " +
					"$1, " +
					"ST_GeomFromText('POINT(' || $2 || ')',4326)" +
					");",
				values : [
				    tweetActivity.postedTime,
				    tweetActivity.geo.coordinates[1] + " " + tweetActivity.geo.coordinates[0]
				]
			},
			function(result) {
				self.logger.info('Logged unconfirmed tweet report');
			}
		);
	},

	/**
	 * Insert a non-spatial tweet report - i.e. we got an addressed tweet without geo coordinates.
	 * @param {GnipTweetActivity} tweetActivity Gnip PowerTrack tweet activity object
	 */
	_insertNonSpatial: function(tweetActivity){
		var self = this;

		self.reports.dbQuery(
			{
				text : "INSERT INTO " + self.config.pg.table_nonspatial_tweet_reports + " " +
					"(created_at, text, hashtags, urls, user_mentions, lang) " +
					"VALUES (" +
					"$1, " +
					"$2, " +
					"$3, " +
					"$4, " +
					"$5, " +
					"$6" +
					");",
				values : [
					tweetActivity.postedTime,
					tweetActivity.body,
					JSON.stringify(tweetActivity.twitter_entities.hashtags),
					JSON.stringify(tweetActivity.twitter_entities.urls),
					JSON.stringify(tweetActivity.twitter_entities.user_mentions),
					tweetActivity.twitter_lang
				]
			},

			function(result) {
				self.logger.info('Inserted non-spatial tweet');
			}
		);

		self._ifNewUser( tweetActivity.actor.preferredUsername, function(result) {
			self.reports.dbQuery(
				{
					text : "INSERT INTO " + self.config.pg.table_nonspatial_users + " (user_hash) VALUES (md5($1));",
					values : [ tweetActivity.actor.preferredUsername ]
				},
				function(result) {
					self.logger.info("Inserted non-spatial user");
				}
			);
		});
	},

	// TODO Integrate into verify config
	/**
	 * Verify that the twitter connection was successful.
	 */
	_verifyTwitterCredentials: function() {
		var self = this;
		
		self.twitter.verifyCredentials(function (err, data) {
			if (err) {
				self.logger.error("twitter.verifyCredentials: Error verifying credentials: " + err);
				self.logger.error("Fatal error: Application shutting down");
				// TODO Failure
			} else {
				self.logger.info("twitter.verifyCredentials: Twitter credentials succesfully verified");
			}
		});
	},
	
	// TODO Integrate into verify config
	/**
	 * Check that all tweetable message texts are of an acceptable length.
	 * This is 109 characters max if timestamps are enabled, or 123 characters max if timestamps are not enabled.
	 * @see {@link https://dev.twitter.com/overview/api/counting-characters} (max tweet = 140 chars)
	 * @see {@link https://support.twitter.com/articles/14609-changing-your-username} (max username = 15 chars)
	 * @return {boolean} True if message texts are all okay, false if any are not.
	 */
	_areTweetMessageLengthsOk: function() {
		var self = this;
		var lengthsOk = true;

		Object.keys( self.config.twitter ).forEach( function(configItemKey) {
			// We only want to process the objects containing language/message pairs here,
			// not the single properties.
			var configItem = self.config.twitter[configItemKey];
			if (typeof configItem === "object") {
				var maxLength = 140; // Maximum tweet length
				maxLength -= 17; // Minus username, @ sign and space = 123
				if ( self.config.twitter.addTimestamp ) maxLength -= 14; // Minus 13 digit timestamp + space = 109 (13 digit timestamp is ok until the year 2286)
				Object.keys( configItem ).forEach( function(messageKey) {
					var message = configItem[messageKey];
					// Twitter shortens (or in some cases lengthens) all URLs to 23 characters
					// https://support.twitter.com/articles/78124 incorrectly lists 22, I have triple checked with a test tweet.
					// Thus here we subtract the length of the url and replace it with 23 characters
					var length = message.length;
					var matches = message.match(/http[^ ]*/g);
					if (matches) {
						for (var i = 0; i < matches.length; i++) {
							length += 23 - matches[i].length;
						}
					}

					if ( length > maxLength ) {
						self.logger.error( "Message " + configItemKey + "." + messageKey + " '" + message + "' is too long (" + message.length + " chars)" );
						lengthsOk = false;
					}
				});
			}
		});

		return lengthsOk;
	},
	
	/**
	 * Stop realtime processing of tweets and start caching tweets until caching mode is disabled.
	 */
	enableCacheMode: function() {
		var self = this;

		self.logger.verbose( 'enableCacheMode: Enabling caching mode' );
		self._cacheMode = true;
	},

	/**
	 * Resume realtime processing of tweets.
	 * Also immediately process any tweets cached while caching mode was enabled.
	 */
	disableCacheMode: function() {
		var self = this;

		self.logger.verbose( 'disableCacheMode: Disabling caching mode' );
		self._cacheMode = false;

		self.logger.verbose( 'disableCacheMode: Processing ' + self._cachedData.length + ' cached tweets' );
		self._cachedData.forEach( function(data) {
			self.filter(data);
		});
		self.logger.verbose( 'disableCacheMode: Cached tweets processed' );
		self._cachedData = [];
	}

};

// Export the PowertrackDataSource constructor
module.exports = PowertrackDataSource;
