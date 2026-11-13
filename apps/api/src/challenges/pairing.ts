export function canonicalPair(userX: string, userY: string): { userAId: string; userBId: string } {
  return userX < userY ? { userAId: userX, userBId: userY } : { userAId: userY, userBId: userX };
}

export function ratingGapBetween(ratingA: number, ratingB: number): number {
  return Math.abs(ratingA - ratingB);
}
