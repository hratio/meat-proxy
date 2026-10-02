type Marker = { top: number; size: number };

/** Connected vertical overlaps share one bounded cluster, including its 2-row footprint. */
export function groupFindingMarkers<T extends Marker>(markers: T[], smallSize: number, gap: number) {
  const groups: { top: number; bottom: number; maxSize: number; markers: T[] }[] = [];
  for (const marker of markers) {
    let group = groups.at(-1);
    if (!group || marker.top >= group.bottom) {
      group = { top: marker.top, bottom: marker.top + marker.size, maxSize: marker.size, markers: [] };
      groups.push(group);
    }
    group.markers.push(marker);
    group.maxSize = Math.max(group.maxSize, marker.size);
    const height = Math.max(group.maxSize, group.markers.length > 2 ? smallSize * 2 + gap : smallSize);
    group.bottom = Math.max(group.bottom, marker.top + marker.size, group.top + height);
  }
  return groups;
}
