import type { Member } from '@/stores/roomStore';
import { Avatar } from './PlayerSeat';

interface SpectatorBarProps {
  spectators: Member[];
  getAvatar: (username?: string) => string | undefined;
}

const spectatorLabel = '\u89c2\u6218\u5e2d';
const emptyLabel = '\u6682\u65e0';

export function SpectatorBar({ spectators, getAvatar }: SpectatorBarProps) {
  return (
    <div className="spectator-bar">
      <span className="spectator-label">{spectatorLabel}</span>
      <div className="spectator-list">
        {spectators.length === 0 ? (
          <span className="spectator-empty">{emptyLabel}</span>
        ) : (
          spectators.map((member) => (
            <div key={member.username} className="spectator-item">
              <Avatar nickname={member.nickname} avatarPath={getAvatar(member.username)} size={28} />
              <span>{member.nickname}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
