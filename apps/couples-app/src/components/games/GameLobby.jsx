import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useChatSettings } from "../../hooks/useChatSettings";
import { useGameLobby } from "../../hooks/useGameLobby";
import { usePartnerGame } from "../../hooks/useGamePresence";
import { avatarFor, preferredNameFor } from "../../lib/avatars";
import { myNameFor, partnerNameFor } from "../../lib/names";

// What a live co-op game shows when there's no match running: choose how to
// play, and — for "Play with Partner" — a waiting room that stays put (even if
// either of you leaves and comes back) until both of you press Ready or
// someone cancels. `onStart(options)` is the game's own start function; it is
// only called once both players are ready. `options` are whatever the game let
// you pick before opening the room (a board size, a target score...) and are
// stored in the room so whoever completes the pair starts it with those.
export default function StartPanel({
  gameKey,
  label,
  onStart,
  onSolo = null,
  noSolo = false,
  options = null,
  emoji = "🎲",
}) {
  const {
    lobby,
    loaded,
    myReady,
    partnerReady,
    openLobby,
    cancelLobby,
    toggleReady,
    resendInvite,
  } = useGameLobby(gameKey, label, onStart);

  if (!loaded)
    return <p className="font-hand text-lg text-ink-soft">one moment…</p>;

  if (!lobby) {
    return (
      <div className="flex w-full max-w-xs flex-col gap-3">
        {!noSolo && (
          <button
            type="button"
            disabled={!onSolo}
            onClick={() => onSolo?.(options)}
            className={`rounded-2xl border border-ink/15 bg-white/40 px-6 py-3 font-body text-ink-soft ${
              onSolo
                ? "transition-colors hover:border-rose hover:text-rose"
                : "cursor-not-allowed"
            }`}
          >
            <span className="block font-medium">Play Solo</span>
            <span className="block text-xs">
              {onSolo
                ? "against the computer"
                : "against the computer — coming soon"}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => openLobby(options)}
          className="rounded-2xl bg-rose px-6 py-3 font-body font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
        >
          <span className="block">{emoji} Play with Partner</span>
          <span className="block text-xs font-normal opacity-90">
            sends them an invite
          </span>
        </button>
      </div>
    );
  }

  return (
    <WaitingRoom
      gameKey={gameKey}
      label={label}
      myReady={myReady}
      partnerReady={partnerReady}
      onToggleReady={toggleReady}
      onCancel={cancelLobby}
      onResend={resendInvite}
    />
  );
}

function WaitingRoom({
  gameKey,
  label,
  myReady,
  partnerReady,
  onToggleReady,
  onCancel,
  onResend,
}) {
  const { user } = useAuth();
  const [chatSettings] = useChatSettings();
  const partnerGame = usePartnerGame();
  const myName = myNameFor(user);
  const partnerName = partnerNameFor(user);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const status = !myReady
    ? partnerReady
      ? `${partnerName} is ready — press Ready to start!`
      : `Press Ready when you want to start ${label}.`
    : partnerReady
      ? "Starting…"
      : `Waiting for ${partnerName}…`;

  return (
    <div className="w-full rounded-3xl border border-ink/10 bg-white/50 p-6 text-center">
      <p className="font-hand text-xl text-ink-soft">waiting room</p>
      <div className="mt-4 flex items-start justify-center gap-8">
        <PlayerBubble
          name={preferredNameFor(myName, chatSettings.preferredNames)}
          src={avatarFor(myName, chatSettings.avatars)}
          ready={myReady}
          here
        />
        <PlayerBubble
          name={preferredNameFor(partnerName, chatSettings.preferredNames)}
          src={avatarFor(partnerName, chatSettings.avatars)}
          ready={partnerReady}
          here={partnerGame === gameKey}
        />
      </div>
      <p className="mt-4 font-body text-sm text-ink-soft">{status}</p>

      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onToggleReady();
            } finally {
              setBusy(false);
            }
          }}
          className={`rounded-full px-6 py-2.5 font-body font-medium transition-transform duration-200 ease-out hover:-translate-y-0.5 disabled:opacity-60 ${
            myReady
              ? "border border-rose text-rose hover:bg-blush-soft"
              : "bg-rose text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)]"
          }`}
        >
          {myReady ? "Not ready" : "Ready"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-ink/20 px-6 py-2.5 font-body font-medium text-ink-soft transition-colors hover:border-rose hover:text-rose"
        >
          Cancel game
        </button>
      </div>
      {!partnerReady && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              onResend();
              setNote("Invite sent again — they'll get a notification!");
            }}
            className="font-body text-xs text-ink-soft underline decoration-dotted underline-offset-4 hover:text-rose"
          >
            Send {partnerName} the invite again
          </button>
          {note && <p className="mt-1 font-hand text-sm text-rose">{note}</p>}
        </div>
      )}
    </div>
  );
}

// One player in the waiting room: lit up (full colour, ring, "Ready") once
// they've confirmed, dimmed and greyed until then. The small dot says whether
// they currently have this game open.
export function PlayerBubble({ name, src, ready, here }) {
  return (
    <div className="flex w-24 flex-col items-center">
      <div
        className={`relative rounded-full p-1 transition-all duration-300 ${
          ready
            ? "bg-teal/20 shadow-[0_0_22px_rgba(80,170,160,0.55)] ring-4 ring-teal"
            : "opacity-40 grayscale"
        }`}
      >
        {src ? (
          <img
            src={src}
            alt={name}
            className="h-20 w-20 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-blush-soft font-display text-3xl italic text-ink">
            {name[0]}
          </span>
        )}
        <span
          className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-paper ${
            here ? "bg-teal" : "bg-ink/30"
          }`}
          title={here ? "Here now" : "Not here right now"}
        />
      </div>
      <p className="mt-2 font-body text-sm font-medium text-ink">{name}</p>
      <p
        className={`font-body text-xs ${ready ? "text-teal" : "text-ink-soft"}`}
      >
        {ready ? "Ready ✓" : here ? "Not ready" : "Not here yet"}
      </p>
    </div>
  );
}

// A slim strip above every game screen: your partner's avatar, lit when they
// have this same game open right now and dimmed when they're elsewhere.
// (Presence comes from the heartbeat Games.jsx publishes — see useGamePresence.)
export function PartnerHereBadge({ gameKey }) {
  const { user } = useAuth();
  const [chatSettings] = useChatSettings();
  const partnerGame = usePartnerGame();
  const name = partnerNameFor(user);
  const src = avatarFor(name, chatSettings.avatars);
  const here = partnerGame === gameKey;
  return (
    <div
      className="flex shrink-0 items-center justify-center gap-2 pt-1.5"
      title={here ? `${name} is here` : `${name} isn't in this game right now`}
    >
      <span
        className={`relative rounded-full transition-all duration-300 ${here ? "ring-2 ring-teal" : "opacity-50 grayscale"}`}
      >
        {src ? (
          <img
            src={src}
            alt={name}
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blush-soft text-xs">
            {name[0]}
          </span>
        )}
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-paper ${
            here ? "animate-pulse bg-teal" : "bg-ink/30"
          }`}
        />
      </span>
      <span
        className={`font-body text-[11px] ${here ? "text-teal" : "text-ink-soft"}`}
      >
        {here ? `${name} is here` : `${name} is away`}
      </span>
    </div>
  );
}
