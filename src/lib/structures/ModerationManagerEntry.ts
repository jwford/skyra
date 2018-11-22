import { MODERATION : { TYPE_ASSETS, TYPE_KEYS, SCHEMA_KEYS, ACTIONS, ERRORS }, TIME; : { YEAR; } } from; '../util/constants';
import { constants : { TIME }, Duration, Timestamp; } from; 'klasa';
import { MessageEmbed } from 'discord.js';
const kTimeout = Symbol('ModerationManagerTimeout');

const TEMPORARY_TYPES = [TYPE_KEYS.BAN, TYPE_KEYS.MUTE, TYPE_KEYS.VOICE_MUTE];

class ModerationManagerEntry {

	public constructor(manager, data = {}) {
		/** @type {SKYRA.ModerationManager} */
		this.manager = manager;
		// @ts-ignore
		this.id = 'id' in data ? data.id : null;
		this.case = SCHEMA_KEYS.CASE in data ? data[SCHEMA_KEYS.CASE] : null;
		this.duration = SCHEMA_KEYS.DURATION in data ? data[SCHEMA_KEYS.DURATION] : null;
		this.extraData = SCHEMA_KEYS.EXTRA_DATA in data ? data[SCHEMA_KEYS.EXTRA_DATA] : null;
		this.moderator = SCHEMA_KEYS.MODERATOR in data ? data[SCHEMA_KEYS.MODERATOR] : null;
		this.reason = SCHEMA_KEYS.REASON in data ? data[SCHEMA_KEYS.REASON] : null;
		this.type = SCHEMA_KEYS.TYPE in data ? data[SCHEMA_KEYS.TYPE] : null;
		this.user = SCHEMA_KEYS.USER in data ? data[SCHEMA_KEYS.USER] : null;
		this.createdAt = SCHEMA_KEYS.CREATED_AT in data ? data[SCHEMA_KEYS.CREATED_AT] : null;
		this[kTimeout] = Date.now() + (TIME.MINUTE * 15);
	}

	public get name() {
		return TYPE_ASSETS[this.type].title;
	}

	public get appealed() {
		// eslint-disable-next-line no-bitwise
		return Boolean(this.type & ACTIONS.APPEALED);
	}

	public get temporary() {
		// eslint-disable-next-line no-bitwise
		return Boolean(this.type & ACTIONS.TEMPORARY);
	}

	public get cacheExpired() {
		return Date.now() > this[kTimeout];
	}

	public get cacheRemaining() {
		return Math.max(Date.now() - this[kTimeout], 0);
	}

	public get shouldSend() {
		// If the moderation log is not anonymous, it should always send
		if (this.moderator) return true;

		const now = Date.now();
		const user = typeof this.user === 'string' ? this.user : this.user.id;
		// @ts-ignore
		const entries = this.manager.filter((entry) => (typeof entry.user === 'string' ? entry.user : entry.user.id) === user && entry.createdAt - now < TIME.MINUTE);

		// If there is no moderation log for this user that has not received a report, it should send
		if (!entries.size) return true;

		// If there was a log with the same type in the last minute, do not duplicate
		if (entries.some((entry) => entry.type === this.type)) return false;

		// If this log is a ban or an unban, but the user was softbanned recently, abort
		if ((this.type === TYPE_KEYS.BAN || this.type === TYPE_KEYS.UN_BAN) && entries.some((entry) => entry.type === TYPE_KEYS.SOFT_BAN)) return false;

		// For all other cases, it should send
		return true;
	}

	public async edit({ [SCHEMA_KEYS.DURATION]: duration, [SCHEMA_KEYS.MODERATOR]: moderator, [SCHEMA_KEYS.REASON]: reason, [SCHEMA_KEYS.EXTRA_DATA]: extraData } = {}) {
		const flattened = {
			[SCHEMA_KEYS.DURATION]: typeof duration !== 'undefined' && TEMPORARY_TYPES.includes(this.type) && (duration === null || duration < YEAR)
				? duration
				: undefined,
			[SCHEMA_KEYS.MODERATOR]: typeof moderator !== 'undefined'
				? typeof moderator === 'string' ? moderator : moderator.id
				: undefined,
			[SCHEMA_KEYS.REASON]: typeof reason !== 'undefined'
				? reason || null
				: undefined,
			[SCHEMA_KEYS.EXTRA_DATA]: typeof extraData !== 'undefined'
				? extraData
				: undefined,
			[SCHEMA_KEYS.TYPE]: this.type
		};

		if (typeof flattened[SCHEMA_KEYS.DURATION] !== 'undefined') {
			// eslint-disable-next-line no-bitwise
			if (flattened[SCHEMA_KEYS.DURATION]) flattened[SCHEMA_KEYS.TYPE] |= ACTIONS.TEMPORARY;
			// eslint-disable-next-line no-bitwise
			else flattened[SCHEMA_KEYS.TYPE] &= ~ACTIONS.TEMPORARY;
		}

		if (typeof flattened[SCHEMA_KEYS.DURATION] !== 'undefined'
			|| typeof flattened[SCHEMA_KEYS.MODERATOR] !== 'undefined'
			|| typeof flattened[SCHEMA_KEYS.REASON] !== 'undefined'
			|| typeof flattened[SCHEMA_KEYS.EXTRA_DATA] !== 'undefined') {
			await this.manager.table.get(this.id).update(flattened).run();
			if (typeof flattened[SCHEMA_KEYS.DURATION] !== 'undefined') this.duration = flattened[SCHEMA_KEYS.DURATION];
			if (typeof flattened[SCHEMA_KEYS.MODERATOR] !== 'undefined') this.moderator = flattened[SCHEMA_KEYS.MODERATOR];
			if (typeof flattened[SCHEMA_KEYS.REASON] !== 'undefined') this.reason = flattened[SCHEMA_KEYS.REASON];
			if (typeof flattened[SCHEMA_KEYS.EXTRA_DATA] !== 'undefined') this.extraData = flattened[SCHEMA_KEYS.EXTRA_DATA];
			this.type = flattened[SCHEMA_KEYS.TYPE];
		}

		return this;
	}

	public async appeal() {
		if (this.appealed) return this;

		// eslint-disable-next-line no-bitwise
		const type = this.type | ACTIONS.APPEALED;
		if (!(type in TYPE_ASSETS)) throw ERRORS.CASE_TYPE_NOT_APPEAL;

		await this.manager.table.get(this.id).update({ [SCHEMA_KEYS.TYPE]: type }).run();
		this.type = type;

		return this;
	}

	public async prepareEmbed() {
		if (!this.user) throw new Error('A user has not been set.');
		const userID = typeof this.user === 'string' ? this.user : this.user.id;
		const [userTag, moderator] = await Promise.all([
			this.manager.guild.client.fetchUsername(userID),
			typeof this.moderator === 'string' ? this.manager.guild.client.users.fetch(this.moderator) : this.moderator || this.manager.guild.client.user
		]);

		const assets = TYPE_ASSETS[this.type];
		const description = (this.duration ? [
			`❯ **Type**: ${assets.title}`,
			`❯ **User:** ${userTag} (${userID})`,
			`❯ **Reason:** ${this.reason || `Please use \`${this.manager.guild.settings.prefix}reason ${this.case} to claim.\``}`,
			// @ts-ignore
			`❯ **Expires In**: ${this.manager.guild.client.languages.default.duration(this.duration)}`
		] : [
			`❯ **Type**: ${assets.title}`,
			`❯ **User:** ${userTag} (${userID})`,
			`❯ **Reason:** ${this.reason || `Please use \`${this.manager.guild.settings.prefix}reason ${this.case} to claim.\``}`
		]).join('\n');

		return new MessageEmbed()
			.setColor(assets.color)
			.setAuthor(moderator.tag, moderator.displayAvatarURL({ size: 128 }))
			.setDescription(description)
			.setFooter(`Case ${this.case}`, this.manager.guild.client.user.displayAvatarURL({ size: 128 }))
			.setTimestamp(new Date(this.createdAt || Date.now()));
	}

	public setCase(value) {
		this.case = value;
		return this;
	}

	public setDuration(value) {
		if (!TEMPORARY_TYPES.includes(this.type)) return this;
		if (typeof value === 'number') this.duration = value;
		else if (typeof value === 'string') this.duration = new Duration(value.trim()).offset;
		if (!this.duration || this.duration > YEAR) this.duration = null;
		// eslint-disable-next-line no-bitwise
		if (this.duration) this.type |= ACTIONS.TEMPORARY;
		return this;
	}

	public setExtraData(value) {
		this.extraData = value;
		return this;
	}

	public setModerator(value) {
		this.moderator = value;
		return this;
	}

	public setReason(value) {
		if (!value) return this;
		value = (Array.isArray(value) ? value.join(' ') : value).trim();

		if (value && TEMPORARY_TYPES.includes(this.type)) {
			const match = ModerationManagerEntry.regexParse.exec(value);
			if (match) {
				this.setDuration(match[1]);
				value = value.slice(0, match.index);
			}
		}

		this.reason = value.length ? value : null;
		return this;
	}

	public setType(value) {
		if (typeof value === 'string' && (value in TYPE_KEYS))
			value = TYPE_KEYS[value];

		else if (typeof value !== 'number')
			throw new TypeError(`${this} | The type ${value} is not valid.`);

		this.type = value;
		return this;
	}

	public setUser(value) {
		this.user = value;
		return this;
	}

	public async create() {
		// If the entry was created, there is no point on re-sending
		if (!this.user || this.createdAt) return null;
		this.createdAt = Date.now();

		// If the entry should not send, abort creation
		if (!this.shouldSend) return null;

		this.case = await this.manager.count() + 1;
		[this.id] = (await this.manager.table.insert(this.toJSON()).run()).generated_keys;
		// @ts-ignore
		this.manager.insert(this);

		/** @type {SKYRA.SkyraTextChannel} */
		// @ts-ignore
		const channel = (this.manager.guild.settings.channels.modlog && this.manager.guild.channels.get(this.manager.guild.settings.channels.modlog)) || null;
		if (channel) {
			const messageEmbed = await this.prepareEmbed();
			channel.send(messageEmbed).catch((error) => this.manager.guild.client.emit('error', error));
		}

		// eslint-disable-next-line no-bitwise
		if (this.duration && (this.type | ACTIONS.APPEALED) in TYPE_ASSETS) {
			// eslint-disable-next-line no-bitwise
			this.manager.guild.client.schedule.create(TYPE_ASSETS[this.type | ACTIONS.APPEALED].title.replace(/ /g, '').toLowerCase(), this.duration + Date.now(), {
				catchUp: true,
				data: {
					[SCHEMA_KEYS.USER]: typeof this.user === 'string' ? this.user : this.user.id,
					[SCHEMA_KEYS.GUILD]: this.manager.guild.id,
					[SCHEMA_KEYS.DURATION]: this.duration,
					[SCHEMA_KEYS.CASE]: this.case
				}
			}).catch((error) => this.manager.guild.client.emit('error', error));
		}

		return this;
	}

	public toJSON() {
		return {
			[SCHEMA_KEYS.CASE]: this.case,
			[SCHEMA_KEYS.DURATION]: this.duration,
			[SCHEMA_KEYS.EXTRA_DATA]: this.extraData,
			[SCHEMA_KEYS.GUILD]: this.manager.guild.id,
			[SCHEMA_KEYS.MODERATOR]: this.moderator ? typeof this.moderator === 'string' ? this.moderator : this.moderator.id : null,
			[SCHEMA_KEYS.REASON]: this.reason,
			[SCHEMA_KEYS.TYPE]: this.type,
			[SCHEMA_KEYS.USER]: this.user ? typeof this.user === 'string' ? this.user : this.user.id : null,
			[SCHEMA_KEYS.CREATED_AT]: this.createdAt
		};
	}

	public toString() {
		return `ModerationManagerEntry<${this.id}>`;
	}

}

ModerationManagerEntry.timestamp = new Timestamp('hh:mm:ss');
ModerationManagerEntry.regexParse = /,? *(?:for|time:?) ((?: ?(?:and|,)? ?\d{1,4} ?\w+)+)\.?$/i;

export ModerationManagerEntry;