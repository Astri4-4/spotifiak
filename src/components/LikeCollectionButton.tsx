import { useCollectionStar, type CollectionKind } from "@/lib/collectionStar";
import { showToast } from "@/lib/songMenu";
import { HeartIcon } from "./icons";

/** The heart of an album or artist page: saves it to Your Library's liked ones. */
export function LikeCollectionButton({ kind, id, name, starred }: { kind: CollectionKind; id: string; name: string; starred?: string }) {
  const { liked, toggle } = useCollectionStar(kind, id, starred);

  async function handleClick() {
    const ok = await toggle();
    if (!ok) showToast(`Couldn't ${liked ? "unlike" : "like"} ${name}`);
    else showToast(liked ? `Removed ${name} from Your Library` : `Added ${name} to Your Library`);
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      aria-label={liked ? "Remove from Your Library" : "Save to Your Library"}
      aria-pressed={liked}
      title={liked ? "Remove from Your Library" : "Save to Your Library"}
      className={`flex-shrink-0 transition hover:scale-105 ${liked ? "text-spotify-green" : "text-spotify-gray hover:text-white"}`}
    >
      <HeartIcon filled={liked} className="h-8 w-8" />
    </button>
  );
}
