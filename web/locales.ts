// UI Locale Strings for the Auction House NUI
// These are used when the server doesn't provide pre-translated strings
// For production, strings should be passed from Lua via NUI events

const locale: Record<string, string> = {
  // Navigation
  'nav.auction_house': 'AUCTION HOUSE',
  'nav.welcome': 'Welcome, %s',
  'nav.available_funds': 'Available Funds',
  'nav.cash': 'Cash: %s',
  'nav.bank': 'Bank: %s',
  'nav.browse': 'Browse Auctions',
  'nav.create': 'Create Auction',
  'nav.collect': 'Collect Items',
  'nav.close': 'Close',

  // Tabs
  'tab.all': 'All Auctions',
  'tab.mine': 'My Auctions',
  'tab.new_auction': '+ New Auction',

  // Search
  'search.placeholder': 'Search by item name or auction ID...',
  'search.no_results': 'No auctions match your search',
  'search.no_auctions': 'No auctions available',
  'search.create_first': 'Create First Auction',
  'search.count': 'Auctions found: %d',
  'search.page': 'Page %d of %d',
  'search.in_category': 'in %s',
  'search.for_query': ' for "%s"',

  // Pagination
  'pagination.first': 'First',
  'pagination.prev': 'Prev',
  'pagination.next': 'Next',
  'pagination.last': 'Last',

  // Auction Card/List
  'auction.your_auction': 'Your Auction',
  'auction.winning': 'Winning',
  'auction.yours': 'Yours',
  'auction.current_bid': 'Current Bid',
  'auction.ends_in': 'Ends In',
  'auction.buy_now': 'Buy Now',
  'auction.by': 'By %s',
  'auction.bids': 'Bids: %d',
  'auction.ended': 'Ended',
  'auction.won_for': 'Won for %s',
  'auction.seller': 'Seller: %s',
  'auction.quantity': 'Quantity: %d',
  'auction.category': 'Category: %s',
  'auction.id': 'ID: %s',
  'auction.qty': 'Qty: %d',

  // Detail View
  'detail.auction_id': 'Auction ID: %s',
  'detail.winning_label': "You're Winning!",
  'detail.your_auction': 'Your Auction',
  'detail.highest_bidder': 'Highest bidder: %s',
  'detail.buyout_price': 'Buyout Price',
  'detail.buy_instantly': 'Buy this item instantly for %s?',
  'detail.yes_buy_now': 'Yes, Buy Now',
  'detail.cancel': 'Cancel',
  'detail.insufficient_funds': 'Insufficient Funds',
  'detail.buy_now': 'Buy Now',
  'detail.cant_buy_own': 'You cannot buy your own auction',
  'detail.enter_bid': 'Enter bid amount...',
  'detail.min': 'Min',
  'detail.min_bid': 'Min bid: %s',
  'detail.your_funds': 'Your funds: %s',
  'detail.place_bid': 'Place Bid: %s',
  'detail.cancel_auction_confirm': 'Cancel this auction? Item will be returned.',
  'detail.yes_cancel': 'Yes, Cancel',
  'detail.no_keep': 'No, Keep It',
  'detail.cancel_auction': 'Cancel Auction',
  'detail.bid_history': 'Bid History (%d)',
  'detail.no_bids': 'No bids yet',

  // Create Form
  'create.title': 'Create Auction',
  'create.select_item': 'Select Item',
  'create.search_inventory': 'Search inventory...',
  'create.no_items': 'No items found',
  'create.available': 'Available: %d',
  'create.starting_bid': 'Starting Bid ($)',
  'create.min_bid_hint': 'Minimum: $0.01 (enter amount like 0.20 or 1.50)',
  'create.buyout_optional': 'Buyout Price ($) (optional)',
  'create.buyout_empty_hint': 'Leave empty for no buyout',
  'create.min_buyout': 'Minimum buyout: %s (%sx starting bid)',
  'create.buyout_summary': 'Buyers can instantly purchase for %s',
  'create.duration': 'Duration',
  'create.category': 'Category',
  'create.select_category': 'Select a category...',
  'create.creation_fee': 'Creation Fee',
  'create.base_fee': 'Base fee',
  'create.duration_fee': 'Duration (%s hrs × %s)',
  'create.quantity_fee': 'Quantity (%d × %s)',
  'create.fee_capped': 'Fee capped at max',
  'create.your_funds': 'Your funds',
  'create.summary': 'Auction Summary',
  'create.summary_item': 'Item',
  'create.summary_category': 'Category',
  'create.summary_starting_bid': 'Starting Bid',
  'create.summary_buyout': 'Buyout Price',
  'create.summary_duration': 'Duration',
  'create.summary_fee': 'Creation Fee',
  'create.submit_select_category': 'Select a category first',
  'create.submit_insufficient_funds': 'Insufficient Funds (Need %s)',
  'create.submit_creating': 'Creating...',
  'create.submit_create': 'Create Auction (%s fee)',

  // Collection Kiosk
  'collect.title': 'Collection Kiosk',
  'collect.subtitle': 'Collect your winnings and sales',
  'collect.no_pending': 'No pending collections',
  'collect.hint': 'Win auctions or sell items to collect here',
  'collect.sales_earnings': 'Sales Earnings',
  'collect.collect': 'Collect',
  'collect.collecting': 'Collecting...',
  'collect.won_items': 'Won Items (%d)',
  'collect.from': 'From: %s',
  'collect.footer': 'Items are collected to your inventory. Money is deposited to your bank.',

  // Notifications (NUI toast)
  'notif.auction_created_title': 'Auction Created',
  'notif.auction_created': '%s (ID: %s) is now up for auction!',
  'notif.bid_placed_title': 'Bid Placed',
  'notif.bid_placed': 'Your bid of %s is now the highest!',
  'notif.cancel_title': 'Auction Cancelled',
  'notif.auction_cancelled': 'Your auction has been cancelled and item returned.',
  'notif.outbid_title': 'Outbid!',
  'notif.won_title': 'Auction Won!',
  'notif.lost_title': 'Auction Lost',
  'notif.sold_title': 'Item Sold!',
  'notif.expired_title': 'Auction Expired',
  'notif.notification': 'Notification',
  'notif.outbid_msg': 'You were outbid on %s. New bid: %s',
  'notif.won_msg': 'You won %s%s for %s!',
  'notif.lost_msg': 'You lost the auction for %s',
  'notif.sold_msg': 'Your %s%s sold for %s!',
  'notif.expired_msg': 'Your %s auction expired. Item returned.',
  'notif.error': 'Error',
  'notif.bid_failed': 'Bid Failed',
  'notif.purchase_complete': 'Purchase Complete!',
  'notif.purchased_item': 'You bought %s for %s!',
  'notif.purchase_failed': 'Purchase Failed',
  'notif.cancel_failed': 'Cancel Failed',
  'notif.collected_item': 'Collected %s x%d',
  'notif.money_collected': 'Collected %s',
  'notif.item_collected_title': 'Item Collected',
  'notif.money_collected_title': 'Money Collected',
  'notif.collection_failed': 'Collection Failed',
  'notif.unknown_error': 'Unknown error',

  'create.quantity': 'Quantity',
  'create.max': 'Max',
  'create.starting_bid_placeholder': '0.00',
  'create.starting_bid_hint': 'Minimum: $0.01 (enter amount like 0.20 or 1.50)',
  'duration.1m': '1 Minute',
  'duration.10m': '10 Minutes',
  'duration.30m': '30 Minutes',
  'duration.1h': '1 Hour',
  'duration.6h': '6 Hours',
  'duration.12h': '12 Hours',
  'duration.1d': '1 Day',
  'duration.3d': '3 Days',
  'duration.7d': '7 Days',

  // View modes
  'view.card': 'Card View',
  'view.list': 'List View',

  // Category sidebar
  'category.all_items': 'All Items',
  'category.title': 'Categories',
};

// Translations sent from Lua (locales/<lang>.json "ui.*" keys) override the English defaults above.
let overrides: Record<string, string> = {};
export function setLocale(strings?: Record<string, string>) {
  if (strings && typeof strings === 'object') overrides = strings;
}

export function t(key: string, ...args: (string | number)[]): string {
  let str = overrides[key] ?? locale[key];
  if (str === undefined) {
    console.warn(`[Auction] Missing locale key: ${key}`);
    return key;
  }
  let argIndex = 0;
  // Substitute %s / %d in the order they appear (replacing all %s first scrambled mixed strings)
  str = str.replace(/%([sd])/g, (_m, kind) => String(args[argIndex++] ?? (kind === 'd' ? 0 : '')));
  return str;
}

export default locale;
