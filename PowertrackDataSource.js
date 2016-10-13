'use strict';

// Prototype object this object extends from - contains basic twitter interaction functions
var BaseTwitterDataSource = require('../BaseTwitterDataSource/BaseTwitterDataSource.js');

/**
 * The Gnip Powertrack data source.
 * Connect to the Gnip Powertrack stream and process matching tweet data.
 * @constructor
 * @augments BaseTwitterDataSource
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
	this.config = config;

	BaseTwitterDataSource.call(this, reports, twitter);

	// Gnip PowerTrack interface module
	this.Gnip = require('gnip');

	this.reports = reports;

	this.lastTweetID = 0;

	// Set constructor reference (used to print the name of this data source)
	this.constructor = PowertrackDataSource;
};

// Set our prototype to be the base object
PowertrackDataSource.prototype = Object.create( BaseTwitterDataSource.prototype );

/**
 * Instance of Gnip object from Gnip module
 * @type {object}
 */
PowertrackDataSource.prototype.Gnip =  null;

/**
 * Data source configuration.
 * This contains the data source specific configuration.
 * @type {object}
 */
PowertrackDataSource.prototype.config = {};

/**
 * Resolve message code from config.twitter using passed language codes.
 * Will fall back to trying to resolve message using default language set in configuration.
 * @param {string} code Message code to lookup in config.twitter
 * @param {GnipTweetActivity} tweetActivity Tweet activity object; check twitter language code and Gnip language codes for a match
 * @returns {?string} Message text, or null if not resolved.
 */
PowertrackDataSource.prototype._getMessage = function(code, tweetActivity) {
	var self = this;

	return self._baseGetMessage(code, self._parseLangsFromActivity(tweetActivity));
};


/**
 * Store the last seen tweet ID and then call the tweet processor.
 @param {GnipTweetActivity} tweetActivity Tweet activity object
 @param {function} tweetProcessor function to process the tweet once the ID has been stored
 */

PowertrackDataSource.prototype._storeTweetID = function(tweetActivity,self,tweetProcessor) {
 var self=this;

 self.reports.dbQuery(
	 {
		 text: "UPDATE seen_tweet_id SET id=$1;",
		 values: [self._parseTweetIdFromActivity(tweetActivity)]
	 },
	 function(result) {
		 let id = Number(self._parseTweetIdFromActivity(tweetActivity));
		 if (id > self.lastTweetID) {
			 self.lastTweetID = id;
			 tweetProcessor(self,tweetActivity);
			 self.logger.verbose('Recorded tweet ' + id + ' as having been seen.');
		 }
	 }
 );
};

/**
 * Retrieve and set the last seen tweetID
 @param {function} tweetProcessor function to call once the last seen tweet ID has been loaded.
 */

PowertrackDataSource.prototype._lastTweetID = function(stream) {
	var self=this;
	self.reports.dbQuery(
		{
			text: "SELECT id FROM seen_tweet_id;"
		},
		function(result) {
			self.lastTweetID = Number(result.rows[0].id);
			stream.start();
		}
	);
};

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
PowertrackDataSource.prototype.filter = function(self,tweetActivity) {
	var self = self;

	self.logger.verbose( 'filter: Received tweetActivity: screen_name="' + tweetActivity.actor.preferredUsername + '", text="' + tweetActivity.body.replace("\n", "") + '", coordinates="' + (tweetActivity.geo && tweetActivity.geo.coordinates ? tweetActivity.geo.coordinates[1]+", "+tweetActivity.geo.coordinates[0] : 'N/A') + '"' );

	// Retweet handling
	if ( tweetActivity.verb === 'share') {
		// Catch tweets from authorised user to verification - handle verification and then continue processing the tweet
		if ( tweetActivity.actor.preferredUsername === self.config.twitter.usernameVerify ) {
			self._processVerifiedReport( self._parseRetweetOriginalTweetIdFromActivity(tweetActivity) );
		} else {
			// If this was a retweet but not from our verification user, ignore it and do no further processing
			self.logger.debug( "filter: Ignoring retweet from user " + tweetActivity.actor.preferredUsername );
			return;
		}
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
			self._sendReplyTweet(
				tweetActivity,
				self._getMessage('invite_text', tweetActivity),
				function(){
					self._insertInvitee(tweetActivity);
				}
			);
		});

	} else if ( !geoInBoundingBox && !hasGeo && locationMatch && addressed ) {
		self.logger.verbose( 'filter: -BOUNDINGBOX -GEO +ADDRESSED +LOCATION = ask user for geo' );

		self._insertNonSpatial(tweetActivity); //User sent us a message but no geo, log as such

		// Ask them to enable geo-location
		self._sendReplyTweet( tweetActivity, self._getMessage('askforgeo_text', tweetActivity) );

	} else if ( !geoInBoundingBox && !hasGeo && locationMatch && !addressed ) {
		self.logger.verbose( 'filter: -BOUNDINGBOX -GEO -ADDRESSED +LOCATION = ask user to participate' );

		// If we haven't contacted the user before, send them an invite tweet
		self._ifNewUser( tweetActivity.actor.preferredUsername, function(result) {
			self._sendReplyTweet(
				tweetActivity,
				self._getMessage('invite_text', tweetActivity),
				function(){
					self._insertInvitee(tweetActivity);
				}
			);
		});

	} else {
		// Not in bounding box but has geocoordinates or no location match
		self.logger.warn( 'filter: Tweet did not match category actions: ' + tweetCategorizations );
	}

};

/**
 * Connect the Gnip stream.
 * Establish the network connection, push rules to Gnip.
 * Setup error handlers and timeout handler.
 * Handle events from the stream on incoming data.
 */
PowertrackDataSource.prototype.start = function() {
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
	    password : self.config.gnip.password,
			backfillMinutes : self.config.gnip.backfillMinutes
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
					self._storeTweetID(tweetActivity,self,self.filter);
				} else {
					// This looks like a system message
					self.logger.info("connectStream: Received system message: " + JSON.stringify(tweetActivity));
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
		self._lastTweetID(stream);
	});

};

/**
 * Insert a confirmed report - i.e. has geo coordinates and is addressed.
 * Store both the tweet information and the user hash.
 * @param {GnipTweetActivity} tweetActivity Gnip PowerTrack tweet activity object
 */
PowertrackDataSource.prototype._insertConfirmed = function(tweetActivity) {
	var self = this;

	self._baseInsertConfirmed(
		tweetActivity.actor.preferredUsername,
		self._parseLangsFromActivity(tweetActivity),
		self._parseTweetIdFromActivity(tweetActivity),
		tweetActivity.postedTime,
		tweetActivity.body,
		JSON.stringify(tweetActivity.twitter_entities.hashtags),
		JSON.stringify(tweetActivity.twitter_entities.urls),
		JSON.stringify(tweetActivity.twitter_entities.user_mentions),
		tweetActivity.twitter_lang,
		tweetActivity.link,
		tweetActivity.geo.coordinates[1] + " " + tweetActivity.geo.coordinates[0]
	);
};

/**
 * Insert an invitee - i.e. a user we've invited to participate.
 * @param {GnipTweetActivity} tweetActivity Gnip PowerTrack tweet activity object
 */
PowertrackDataSource.prototype._insertInvitee = function(tweetActivity) {
	var self = this;

	self._baseInsertInvitee(tweetActivity.actor.preferredUsername);
};

/**
 * Insert an unconfirmed report - i.e. has geo coordinates but is not addressed.
 * @param {GnipTweetActivity} tweetActivity Gnip PowerTrack tweet activity object
 */
PowertrackDataSource.prototype._insertUnConfirmed = function(tweetActivity) {
	var self = this;

	self._baseInsertUnConfirmed(
	    tweetActivity.postedTime,
	    tweetActivity.geo.coordinates[1] + " " + tweetActivity.geo.coordinates[0]
	);
};

/**
 * Insert a non-spatial tweet report - i.e. we got an addressed tweet without geo coordinates.
 * @param {GnipTweetActivity} tweetActivity Gnip PowerTrack tweet activity object
 */
PowertrackDataSource.prototype._insertNonSpatial = function(tweetActivity) {
	var self = this;

	self._baseInsertNonSpatial(
		tweetActivity.actor.preferredUsername,
		tweetActivity.postedTime,
		tweetActivity.body,
		JSON.stringify(tweetActivity.twitter_entities.hashtags),
		JSON.stringify(tweetActivity.twitter_entities.urls),
		JSON.stringify(tweetActivity.twitter_entities.user_mentions),
		tweetActivity.twitter_lang
	);
};


/**
 * Send @reply Twitter message
 * @param {GnipTweetActivity} tweetActivity The Gnip tweet activity object this is a reply to
 * @param {string} message The tweet text to send
 * @param {function} success Callback function called on success
 */
PowertrackDataSource.prototype._sendReplyTweet = function(tweetActivity, message, success) {
	var self = this;

	self._baseSendReplyTweet(
		tweetActivity.actor.preferredUsername,
		self._parseTweetIdFromActivity(tweetActivity),
		message,
		success
	);
};

/**
 * Get tweet ID from Gnip tweet activity.
 * @param {GnipTweetActivity} tweetActivity The Gnip tweet activity object to fetch ID from
 * @return {string} Tweet ID
 */
PowertrackDataSource.prototype._parseTweetIdFromActivity = function(tweetActivity) {
	return tweetActivity.id.split(':')[2];
};

/**
 * Get retweet's original tweet ID from Gnip tweet activity.
 * @param {GnipTweetActivity} tweetActivity The Gnip tweet activity object to fetch retweet's original tweet ID from
 * @return {string} Tweet ID
 */
PowertrackDataSource.prototype._parseRetweetOriginalTweetIdFromActivity = function(tweetActivity) {
	return tweetActivity.object.id.split(':')[2];
};

/**
 * Get language codes from the activity.
 * @param {GnipTweetActivity} tweetActivity The Gnip tweet activity object to fetch languages from
 */
PowertrackDataSource.prototype._parseLangsFromActivity = function(tweetActivity) {
	// Fetch the language codes from both twitter and Gnip data, if present
	var langs = [];

	if (tweetActivity.twitter_lang) langs.push(tweetActivity.twitter_lang);
	if (tweetActivity.gnip && tweetActivity.gnip.language && tweetActivity.gnip.language.value) langs.push(tweetActivity.gnip.language.value);

	return langs;
};

// Export the PowertrackDataSource constructor
module.exports = PowertrackDataSource;
