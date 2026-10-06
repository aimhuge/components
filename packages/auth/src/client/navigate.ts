/** Leave for `url`. Its own module so tests can stand in for the browser,
 *  where jsdom can't navigate and `location.assign` can't be replaced. */
export function navigateTo(url: string): void {
  window.location.assign(url);
}
