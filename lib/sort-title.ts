export default function sortTitle(title: string): string {
  return title.toLowerCase().replace(/^(a|an|the|der|die|das) /, '');
}
