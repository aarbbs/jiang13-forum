import { EMOJI_LIST } from '../utils/emojis';

interface Props {
  onSelect: (emoji: string) => void;
}

/** OwO 表情选择面板 */
export default function EmojiPicker({ onSelect }: Props) {
  return (
    <div className="emoji-picker">
      {EMOJI_LIST.map((e) => (
        <button
          key={e}
          type="button"
          className="emoji-picker-item"
          onClick={() => onSelect(e)}
        >
          {e}
        </button>
      ))}
    </div>
  );
}
