import { MusicHandler, MusicHandlerRequestContext } from '@lib/structures/music/MusicHandler';
import { Song } from '@lib/structures/music/Song';
import { OutgoingWebsocketAction } from '@lib/websocket/types';
import { floatPromise } from '@utils/util';
import { Util } from 'discord.js';
import { Event } from 'klasa';

export default class extends Event {

	public async run(manager: MusicHandler, song: Song, context: MusicHandlerRequestContext | null) {
		const channel = context ? context.channel : manager.channel;

		manager.position = 0;
		manager.lastUpdate = 0;
		manager.song = song;
		manager.systemPaused = false;

		if (channel) {
			const name = Util.escapeMarkdown(await this.fetchDisplayName(manager, song.requester));
			floatPromise(this, channel.sendLocale('COMMAND_PLAY_NEXT', [song.safeTitle, name]));
		}

		for (const subscription of manager.websocketUserIterator()) {
			subscription.send({ action: OutgoingWebsocketAction.MusicSongPlay, data: song });
		}
	}

	private async fetchDisplayName(manager: MusicHandler, requester: string) {
		try {
			const memberTag = await manager.guild.memberTags.fetch(requester);
			if (memberTag !== null) return memberTag.nickname || this.fetchUsername(manager, requester);
		} catch { }

		return this.fetchUsername(manager, requester);
	}

	private async fetchUsername(manager: MusicHandler, requester: string) {
		try {
			const userTag = await this.client.userTags.fetch(requester);
			if (userTag !== null) return userTag.username;
		} catch { }

		return manager.guild.language.tget('UNKNOWN_USER');
	}

}
