const { Collection, Guild } = require('discord.js');
const LIMITS = {
	GLOBAL: 25000,
	MEMBERS: 5000
};

/**
 * The Leaderboard singleton class in charge of storing local and global leaderboards
 * @since 3.0.0
 * @version 1.0.0
 */
class Leaderboard {

	/**
	 * @typedef  {Object} LeaderboardUser
	 * @property {number} points
	 * @property {number} position
	 * @memberof Leaderboard
	 */

	/**
	 * @typedef  {Object} LeaderboardTimeouts
	 * @property {?PreciseTimeout} users
	 * @property {Collection<string, PreciseTimeout>} guilds
	 * @memberof Leaderboard
	 */

	/**
	 * @typedef  {Object} LeaderboardPromises
	 * @property {?Promise<void>} users
	 * @property {Collection<string, Promise<void>>} guilds
	 * @memberof Leaderboard
	 */

	/**
	 * Create a new leaderboard singleton
	 * @since 3.0.0
	 * @param {Skyra} client The client that instantiated this class
	 */
	constructor(client) {
		/**
		 * The Client that initialized this instance
		 * @since 3.0.0
		 * @type {Skyra}
		 */
		this.client = client;

		/**
		 * The cached global leaderboard
		 * @since 3.0.0
		 * @type {Collection<string, LeaderboardUser>}
		 */
		this.users = new Collection();

		/**
		 * The cached collection for local leaderboards
		 * @since 3.0.0
		 * @type {Collection<string, Collection<string, LeaderboardUser>>}
		 */
		this.guilds = new Collection();

		/**
		 * The timeouts object
		 * @since 3.0.0
		 * @type {LeaderboardTimeouts}
		 */
		this.timeouts = {
			/**
			 * The timeout for the global leaderboard to reset
			 * @since 3.0.0
			 * @type {?PreciseTimeout}
			 */
			users: null,

			/**
			 * The collection of timeouts for each local leaderboard to reset
			 * @since 3.0.0
			 * @type {Collection<string, PreciseTimeout>}
			 */
			guilds: new Collection()
		};

		/**
		 * The promises cache
		 * @since 3.0.0
		 * @type {LeaderboardPromises}
		 * @private
		 */
		this._tempPromises = {
			/**
			 * The Promise that is syncing the cache with the database, if syncing
			 * @since 3.0.0
			 * @type {?Promise<void>}
			 */
			users: null,

			/**
			 * The collection of Promises that are running, if syncing
			 * @since 3.0.0
			 * @type {Collection<string, Promise<void>>}
			 */
			guilds: new Collection()
		};
	}

	/**
	 * Get the leaderboard for the selected guild
	 * @since 3.0.0
	 * @param {(string|Guild)} guild A guild id or instance
	 * @returns {Promise<Collection<string, LeaderboardUser>>}
	 */
	async getMembers(guild) {
		if (this._tempPromises.guilds.has(guild)) await this._tempPromises.guilds.get(guild);
		else if (!this.guilds.has(guild)) await this.syncMembers(guild);
		return this.guilds.get(guild);
	}

	/**
	 * Get the global leaderboard
	 * @since 3.0.0
	 * @returns {Promise<Collection<string, LeaderboardUser>>}
	 */
	async getUsers() {
		if (this._tempPromises.users) await this._tempPromises.users;
		else if (this.users.size === 0) await this.syncUsers();
		return this.users;
	}

	/**
	 * Sync the leaderboard for the selected guild
	 * @since 3.0.0
	 * @param {(stringGuild)} guild A guild id or instance
	 */
	async syncMembers(guild) {
		if (!guild) throw new Error('The parameter \'guild\' must be specified.');
		if (guild instanceof Guild) guild = guild.id;
		if (typeof guild !== 'string') throw new TypeError(`Expected the parameter 'guild' to be an instance of Guild or a string. Got: ${typeof guild}`);

		// If it's still on timeout, reset it
		if (this.timeouts.guilds.has(guild))
			this.timeouts.guilds.get(guild).stop();
		// It's not deleting the entry as the previous run will resolve

		// Get the sorted data from the db
		await this._syncMembers(guild);

		// Set the timeout for the refresh
		const timeout = new PreciseTimeout(MINUTE * 10);
		this.timeouts.guilds.set(guild, timeout);

		timeout.run().then(() => {
			this.timeouts.guilds.delete(guild);
			this.guilds.get(guild).clear();
			this.guilds.delete(guild);
		});
	}

	/**
	 * Sync the global leaderboard
	 * @since 3.0.0
	 */
	async syncUsers() {
		// If it's still on timeout, reset it
		this.clearUsers();

		await this._syncUsers();

		// Set the timeout for the refresh
		this.timeouts.users = new PreciseTimeout(MINUTE * 15);
		this.timeouts.users.run().then(() => {
			this.timeouts.users = null;
			this.users.clear();
		});
	}

	/**
	 * Clear the entire cache and timeouts
	 * @since 3.0.0
	 */
	dispose() {
		this.clearGuilds();
		this.clearUsers();
	}

	/**
	 * Clear the guilds cache
	 * @since 3.0.0
	 */
	clearGuilds() {
		for (const timeout of this.timeouts.guilds.values())
			timeout.stop();
	}

	/**
	 * Clear the user leaderboard cache
	 * @since 3.0.0
	 */
	clearUsers() {
		if (this.timeouts.users)
			this.timeouts.users.stop();
	}

	/**
	 * Sync the members and caches the sync status
	 * @since 3.0.0
	 * @param {string} guild The SkyraGuild ID to sync
	 * @returns {Promise<void>}
	 * @private
	 */
	_syncMembers(guild) {
		const promise = new Promise(async (resolve) => {
			const r = this.client.providers.default.db;
			const data = await r.table('localScores').filter({ guildID: guild }).orderBy(r.desc('count')).limit(LIMITS.MEMBERS);

			// Clear the leaderboards for said guild
			if (!this.guilds.has(guild)) this.guilds.set(guild, new Collection());
			else this.guilds.get(guild).clear();

			// Get the store and initialize the position number, then save all entries
			const store = this.guilds.get(guild);
			for (let i = 0; i < data.length; i++) store.set(data[i].userID, { name: null, points: data[i].count, position: i + 1 });

			resolve();
		}).then(() => { this._tempPromises.guilds.delete(guild); });

		this._tempPromises.guilds.set(guild, promise);
		return promise;
	}

	/**
	 * Sync the users and caches the sync status
	 * @since 3.0.0
	 * @returns {Promise<void>}
	 * @private
	 */
	_syncUsers() {
		const promise = new Promise(async (resolve) => {
			// Get the sorted data from the db
			const r = this.client.providers.default.db;
			const data = await r.table('users').orderBy(r.desc('points')).limit(LIMITS.GLOBAL);

			// Get the store and initialize the position number, then save all entries
			this.users.clear();
			for (let i = 0; i < data.length; i++) this.users.set(data[i].id, { name: null, points: data[i].points, position: i + 1 });

			resolve();
		}).then(() => { this._tempPromises.users = null; });

		this._tempPromises.users = promise;
		return promise;
	}

}

const SECOND = 1000;
const MINUTE = SECOND * 60;

module.exports = Leaderboard;

const PreciseTimeout = require('./PreciseTimeout');