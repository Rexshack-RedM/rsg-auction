import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { t, setLocale } from './locales';
import { isDebug, useNuiEvent, fetchNui } from './hooks/useNui';

// Money formatting utilities - all values are in CENTS
const Money = {
  // Format cents as dollar string with 2 decimal places
  format: (cents: number | null | undefined): string => {
    if (cents === null || cents === undefined || isNaN(cents)) return '$0.00';
    const dollars = Math.floor(cents / 100);
    const remainder = Math.abs(cents % 100);
    const remainderStr = remainder < 10 ? '0' + remainder : remainder.toString();
    return `$${dollars}.${remainderStr}`;
  },
  
  // Format cents with commas for thousands
  formatWithCommas: (cents: number | null | undefined): string => {
    if (cents === null || cents === undefined || isNaN(cents)) return '$0.00';
    const dollars = Math.floor(cents / 100);
    const remainder = Math.abs(cents % 100);
    const remainderStr = remainder < 10 ? '0' + remainder : remainder.toString();
    const formattedDollars = dollars.toLocaleString();
    return `$${formattedDollars}.${remainderStr}`;
  },
  
  // Convert dollars (float) to cents (integer)
  dollarsToCents: (dollars: number): number => {
    return Math.round(dollars * 100);
  },
  
  // Convert cents to dollars (float)
  centsToDollars: (cents: number): number => {
    return cents / 100;
  },
  
  // Parse a dollar string input to cents
  parseToCents: (input: string | number): number => {
    if (typeof input === 'number') {
      return Math.round(input * 100);
    }
    // Remove $ and whitespace
    const cleaned = input.replace(/[$\s]/g, '');
    const dollars = parseFloat(cleaned);
    if (isNaN(dollars) || dollars < 0) return 0;
    return Math.round(dollars * 100);
  }
};

// Types
interface ImageMeta {
  url: string;
  itemName: string;
  fallbackUrl: string;
  loaded?: boolean;
  failed?: boolean;
}

interface InventoryItem {
  name: string;
  label: string;
  count: number;
  slot: number;
  metadata: Record<string, any>;
  image?: string;
  imageMeta?: ImageMeta;
}

interface Player {
  name: string;
  citizenid: string;
}

interface Auction {
  id: string;
  owner: Player;
  item: {
    name: string;
    label: string;
    count: number;
    metadata: Record<string, any>;
    image?: string;
    imageMeta?: ImageMeta;
  };
  category?: string;
  location?: string;
  locationLabel?: string;
  startingBidCents: number;
  currentBidCents: number;
  buyoutPriceCents?: number;
  highestBidder: Player | null;
  endTime: number;
  createdAt: number;
  status: 'active' | 'ended' | 'cancelled';
  totalBids: number;
  winner?: Player;
  soldForCents?: number;
}

interface BidEntry {
  playerName: string;
  citizenid: string;
  amountCents: number;
  timestamp: number;
  isBuyout?: boolean;
}

interface Notification {
  id: string;
  type: 'outbid' | 'won' | 'lost' | 'sold' | 'expired' | 'error' | 'success' | 'info';
  title: string;
  message: string;
}

interface PlayerData {
  inventory: InventoryItem[];
  cashCents: number;
  bankCents: number;
  citizenid: string;
  playerName: string;
  feeConfig?: FeeConfig;
  buyoutConfig?: BuyoutConfig;
  minBidIncrement?: number;
  minDuration?: number;
  maxDuration?: number;
  blacklist?: string[];
  categories?: Category[];
  location?: string;
  locationLabel?: string;
  locale?: Record<string, string>;
}

// Pure HTML dropdown. Native <select> popups render pixelated in RedM's CEF and can crash the game.
function Dropdown<T extends string | number>({ value, options, placeholder, onChange }: {
  value: T | '';
  options: { value: T; label: string }[];
  placeholder?: string;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  const current = options.find(o => o.value === value);
  return (
    <div ref={ref} className={`dd ${open ? 'dd-open' : ''}`}>
      <div className="dd-value" onClick={() => setOpen(o => !o)}>
        <span className={current ? '' : 'dd-placeholder'}>{current ? current.label : placeholder}</span>
        <span className="dd-arrow">▾</span>
      </div>
      {open && (
        <div className="dd-menu">
          {options.map(o => (
            <div
              key={String(o.value)}
              className={`dd-opt ${o.value === value ? 'dd-selected' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface FeeConfig {
  enabled: boolean;
  baseFee: number;
  durationMultiplier: number;
  quantityMultiplier: number;
  maxFee: number;
  minFee: number;
}

interface FeeBreakdown {
  enabled: boolean;
  baseFeeCents: number;
  durationFeeCents: number;
  quantityFeeCents: number;
  totalCents: number;
  maxFeeCents?: number;
  minFeeCents?: number;
  wasCapped?: boolean;
}

interface Pagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
  query: string;
}

interface Category {
  id: string;
  label: string;
  icon: string;
  description: string;
}

interface BuyoutConfig {
  enabled: boolean;
  minMultiplier: number;
}

type ViewMode = 'card' | 'list';

// Pending Collection Types
interface PendingItem {
  itemName: string;
  itemLabel: string;
  count: number;
  metadata: Record<string, any>;
  auctionId: string;
  image?: string;
  imageMeta?: ImageMeta;
  soldForCents: number;
  sellerName: string;
  collectedAt?: number;
}

interface PendingMoney {
  amountCents: number;
  reason: string;
  auctionId?: string;
  itemName?: string;
  collectedAt?: number;
}

interface PendingCollections {
  money: PendingMoney | null;
  items: PendingItem[];
}

// Image cache for tracking loaded images across components
const imageCache: Record<string, { loaded: boolean; failed: boolean }> = {};

// Async Image Component with fallback and error handling
function AsyncImage({ 
  imageMeta, 
  alt, 
  className,
  fallbackIcon = '📦'
}: { 
  imageMeta?: ImageMeta; 
  alt: string; 
  className?: string;
  fallbackIcon?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);

  const imageUrl = imageMeta?.url;
  const fallbackUrl = imageMeta?.fallbackUrl;
  const itemName = imageMeta?.itemName;

  useEffect(() => {
    if (!imageUrl) {
      setFailed(true);
      return;
    }

    // Check cache first
    if (imageCache[imageUrl]?.loaded) {
      setLoaded(true);
      setFailed(false);
      setCurrentUrl(imageUrl);
      return;
    }

    if (imageCache[imageUrl]?.failed) {
      setFailed(true);
      setLoaded(false);
      setCurrentUrl(fallbackUrl || null);
      return;
    }

    // Start loading
    setLoaded(false);
    setFailed(false);
    setCurrentUrl(imageUrl);
  }, [imageUrl, fallbackUrl]);

  const handleLoad = useCallback(() => {
    if (!imageUrl) return;
    
    setLoaded(true);
    setFailed(false);
    imageCache[imageUrl] = { loaded: true, failed: false };

  }, [imageUrl, itemName]);

  const handleError = useCallback(() => {
    if (!imageUrl) return;
    
    setFailed(true);
    setLoaded(false);
    imageCache[imageUrl] = { loaded: false, failed: true };
    
    // Switch to fallback
    if (fallbackUrl) {
      setCurrentUrl(fallbackUrl);
    }
    
    // Report to Lua
    fetchNui('imageFailed', { url: imageUrl, itemName }, { success: true });
  }, [imageUrl, itemName, fallbackUrl]);

  // No image metadata - show placeholder
  if (!imageMeta || !imageUrl) {
    return (
      <div className={`${className || ''} flex items-center justify-center bg-stone-800`}>
        <span className="text-3xl text-stone-600">{fallbackIcon}</span>
      </div>
    );
  }

  // Image failed and no fallback - show placeholder
  if (failed && !fallbackUrl) {
    return (
      <div className={`${className || ''} flex items-center justify-center bg-stone-800`}>
        <span className="text-3xl text-stone-600">{fallbackIcon}</span>
      </div>
    );
  }

  return (
    <div className={`${className || ''} relative overflow-hidden`}>
      <img 
        src={currentUrl || ''} 
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={handleLoad}
        onError={handleError}
      />
      {(!loaded && !failed) && (
        <div className="absolute inset-0 flex items-center justify-center bg-stone-800">
          <div className="animate-pulse text-stone-600 text-2xl">⏳</div>
        </div>
      )}
    </div>
  );
}

// Notification Component
function NotificationToast({ notification, onDismiss }: { notification: Notification; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const icons: Record<string, string> = {
    outbid: '⚠',
    won: '🏆',
    lost: '💔',
    sold: '💰',
    expired: '⏰',
    error: '❌',
    success: '✓',
    info: 'ℹ'
  };

  const tone: Record<string, string> = {
    outbid: 't-warning',
    won: 't-success',
    lost: 't-error',
    sold: 't-success',
    expired: 't-info',
    error: 't-error',
    success: 't-success',
    info: 't-info'
  };

  return (
    <div className={`rdr-toast ${tone[notification.type] || 't-info'} flex items-start gap-3 p-3`}>
      <span className="text-lg leading-none mt-0.5">{icons[notification.type]}</span>
      <div className="flex-1 min-w-0">
        <p className="rdr-toast-label">{notification.title}</p>
        <p className="text-stone-200 text-sm mt-1">{notification.message}</p>
      </div>
      <button onClick={onDismiss} className="text-stone-500 hover:text-white text-xs">✕</button>
    </div>
  );
}

// Countdown Timer Component
function CountdownTimer({ endTime }: { endTime: number }) {
  const [remaining, setRemaining] = useState(endTime - Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(Math.max(0, endTime - Math.floor(Date.now() / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  if (remaining <= 0) return <span className="text-red-400 font-semibold">{t('auction.ended')}</span>;

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  const timeString = hours > 0
    ? `${hours}h ${minutes}m ${seconds}s`
    : minutes > 0
      ? `${minutes}m ${seconds}s`
      : `${seconds}s`;

  const colorClass = remaining < 60 ? 'text-red-400' : remaining < 300 ? 'text-amber-400' : 'text-stone-200';

  return <span className={`font-mono ${colorClass}`}>{timeString}</span>;
}

// Helper to get category info by id
function getCategoryInfo(categoryId: string | undefined, categories: Category[] | undefined): Category | undefined {
  if (!categoryId || !categories) return undefined;
  return categories.find(c => c.id === categoryId);
}

// Auction Card Component
function AuctionCard({ 
  auction, 
  onSelect, 
  isSelected,
  playerCitizenid,
  categories
}: { 
  auction: Auction; 
  onSelect: () => void;
  isSelected: boolean;
  playerCitizenid: string;
  categories?: Category[];
}) {
  const isOwnAuction = auction.owner.citizenid === playerCitizenid;
  const isHighestBidder = !!auction.highestBidder && auction.highestBidder.citizenid === playerCitizenid;
  const categoryInfo = getCategoryInfo(auction.category, categories);

  return (
    <div 
      onClick={onSelect}
      className={`rdr-row p-4 cursor-pointer ${isSelected ? 'is-active' : ''}`}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-semibold truncate">{auction.item.label}</h3>
            {categoryInfo && (
              <span className="rdr-pill px-1.5 py-0.5 text-[10px] text-stone-300 flex-shrink-0" title={categoryInfo.description}>
                {categoryInfo.icon} {categoryInfo.label}
              </span>
            )}
          </div>
          <p className="text-stone-500 text-xs">{t('auction.id', auction.id)}</p>
          <p className="text-stone-400 text-xs">{t('auction.qty', auction.item.count)}</p>
        </div>
        <div className="flex flex-col gap-1 items-end">
          {isOwnAuction && (
            <span className="px-2 py-0.5 text-xs bg-amber-800 text-amber-200 rounded">{t('auction.your_auction')}</span>
          )}
          {isHighestBidder && !isOwnAuction && (
            <span className="px-2 py-0.5 text-xs bg-emerald-800 text-emerald-200 rounded">{t('auction.winning')}</span>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center text-sm">
        <div>
          <p className="text-stone-500 text-xs">{t('auction.current_bid')}</p>
          <p className="text-amber-400 font-semibold">
            {Money.formatWithCommas((auction.currentBidCents || 0) > 0 ? auction.currentBidCents : auction.startingBidCents)}
          </p>
        </div>
        <div className="text-right">
                <p className="text-stone-500 text-xs">{t('auction.ends_in')}</p>
          <CountdownTimer endTime={auction.endTime} />
        </div>
      </div>

      {auction.buyoutPriceCents && auction.buyoutPriceCents > 0 && (
        <div className="mt-2 pt-2 border-t border-stone-700/50 flex items-center justify-between">
          <span className="text-emerald-400 text-xs font-medium">{t('auction.buy_now')}</span>
          <span className="text-emerald-300 text-sm font-semibold">{Money.format(auction.buyoutPriceCents)}</span>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-stone-700/50 flex justify-between text-xs text-stone-500">
        <span>{t('auction.by', auction.owner.name)}</span>
        <span>{t('auction.bids', auction.totalBids)}</span>
      </div>
    </div>
  );
}

// Auction List Row Component (Compact)
function AuctionListRow({ 
  auction, 
  onSelect, 
  isSelected,
  playerCitizenid,
  categories
}: { 
  auction: Auction; 
  onSelect: () => void;
  isSelected: boolean;
  playerCitizenid: string;
  categories?: Category[];
}) {
  const isOwnAuction = auction.owner.citizenid === playerCitizenid;
  const isHighestBidder = !!auction.highestBidder && auction.highestBidder.citizenid === playerCitizenid;
  const categoryInfo = getCategoryInfo(auction.category, categories);

  return (
    <div 
      onClick={onSelect}
      className={`rdr-row flex items-center gap-[14px] p-3 cursor-pointer ${isSelected ? 'is-active' : ''}`}
    >
      {/* Item Image */}
      <AsyncImage 
        imageMeta={auction.item.imageMeta}
        alt={auction.item.label}
        className="w-12 h-12 rounded-lg flex-shrink-0"
      />
      
      {/* Item Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-white font-medium truncate">{auction.item.label}</h3>
          {categoryInfo && (
            <span className="rdr-pill px-1.5 py-0.5 text-[10px] text-stone-300 flex-shrink-0">
              {categoryInfo.icon}
            </span>
          )}
          {isOwnAuction && (
            <span className="px-1.5 py-0.5 text-[10px] bg-amber-800 text-amber-200 rounded flex-shrink-0">{t('auction.yours')}</span>
          )}
          {isHighestBidder && !isOwnAuction && (
            <span className="px-1.5 py-0.5 text-[10px] bg-emerald-800 text-emerald-200 rounded flex-shrink-0">{t('auction.winning')}</span>
          )}
        </div>
        <p className="text-stone-500 text-xs truncate">{t('detail.auction_id', auction.id)} | {t('auction.quantity', auction.item.count)} | {t('auction.by', auction.owner.name)}</p>
      </div>
      
      {/* Bid Info */}
      <div className="text-right flex-shrink-0 w-28">
        <p className="text-amber-400 font-semibold text-sm">
          {Money.formatWithCommas((auction.currentBidCents || 0) > 0 ? auction.currentBidCents : auction.startingBidCents)}
        </p>
        <p className="text-stone-500 text-xs">{t('auction.bids', auction.totalBids)}</p>
      </div>

      {/* Buyout */}
      {auction.buyoutPriceCents && auction.buyoutPriceCents > 0 && (
        <div className="text-right flex-shrink-0 w-24">
          <p className="text-emerald-400 font-semibold text-sm">{Money.format(auction.buyoutPriceCents)}</p>
          <p className="text-emerald-600 text-xs">{t('auction.buy_now')}</p>
        </div>
      )}

      {/* Timer */}
      <div className="text-right flex-shrink-0 w-24">
        <CountdownTimer endTime={auction.endTime} />
      </div>
    </div>
  );
}

// Create Auction Form Component
function CreateAuctionForm({
  inventory,
  onCreate,
  onClose,
  isSubmitting,
  feeConfig,
  buyoutConfig,
  playerFundsCents,
  categories,
  minDuration,
  maxDuration,
  blacklist
}: {
  inventory: InventoryItem[];
  onCreate: (data: { itemName: string; slot: number; count: number; startingBid: number; duration: number; category: string; buyoutPrice?: number }) => void;
  onClose: () => void;
  isSubmitting: boolean;
  feeConfig?: FeeConfig;
  buyoutConfig?: BuyoutConfig;
  playerFundsCents: number;
  categories?: Category[];
  minDuration?: number;
  maxDuration?: number;
  blacklist?: string[];
}) {
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [count, setCount] = useState(1);
  const [startingBidDollars, setStartingBidDollars] = useState<string>('1.00');
  const [buyoutDollars, setBuyoutDollars] = useState<string>('');
  const [duration, setDuration] = useState(3600);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredInventory = useMemo(() => {
    if (!inventory || !Array.isArray(inventory)) return [];
    // Hide items the server will refuse (blacklisted, e.g. money items)
    let items = blacklist ? inventory.filter(item => blacklist.indexOf(item.name) === -1) : inventory;
    if (searchQuery) {
      items = items.filter(item =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return items;
  }, [inventory, searchQuery, blacklist]);

  // Calculate local fee preview (client-side for responsiveness)
  // All values in CENTS
  const localFeePreview = useMemo(() => {
    if (!feeConfig || !feeConfig.enabled) {
      return { enabled: false, totalCents: 0, baseFeeCents: 0, durationFeeCents: 0, quantityFeeCents: 0 };
    }

    const baseFeeCents = Money.dollarsToCents(feeConfig.baseFee || 0);
    const durationMultiplierCents = Money.dollarsToCents(feeConfig.durationMultiplier || 0);
    const quantityMultiplierCents = Money.dollarsToCents(feeConfig.quantityMultiplier || 0);
    const maxFeeCents = Money.dollarsToCents(feeConfig.maxFee || 500);
    const minFeeCents = Money.dollarsToCents(feeConfig.minFee || 0);

    const durationHours = duration / 3600;
    const durationFeeCents = Math.floor(durationMultiplierCents * durationHours);
    const quantityFeeCents = quantityMultiplierCents * count;
    const totalFeeCents = baseFeeCents + durationFeeCents + quantityFeeCents;

    const cappedFeeCents = Math.max(minFeeCents, Math.min(maxFeeCents, totalFeeCents));
    const wasCapped = totalFeeCents > maxFeeCents;

    return {
      enabled: true,
      baseFeeCents,
      durationFeeCents,
      quantityFeeCents,
      totalCents: cappedFeeCents,
      maxFeeCents,
      minFeeCents,
      wasCapped
    };
  }, [feeConfig, duration, count]);

  const canAffordFee = playerFundsCents >= localFeePreview.totalCents;
  const selectedCategoryLabel = categories?.find(c => c.id === selectedCategory)?.label || '';

  // Calculate buyout validation
  const startingBidCents = Money.parseToCents(startingBidDollars);
  const buyoutCents = buyoutDollars ? Money.parseToCents(buyoutDollars) : 0;
  const minBuyoutCents = buyoutConfig?.enabled ? Math.ceil(startingBidCents * (buyoutConfig.minMultiplier || 1.5)) : 0;
  const isBuyoutValid = !buyoutDollars || buyoutCents >= minBuyoutCents;

  const handleSubmit = (e: import('react').FormEvent) => {
    e.preventDefault();
    if (!selectedItem || count < 1 || startingBidCents < 1) return;
    if (!canAffordFee) return;
    if (!selectedCategory) return;
    if (buyoutDollars && !isBuyoutValid) return;
    onCreate({
      itemName: selectedItem.name,
      slot: selectedItem.slot,
      count,
      startingBid: startingBidCents,
      duration,
      category: selectedCategory,
      buyoutPrice: buyoutDollars ? buyoutCents : undefined
    });
  };

  const durationOptions = [
    { label: t('duration.1m'), value: 60 },
    { label: t('duration.10m'), value: 600 },
    { label: t('duration.30m'), value: 1800 },
    { label: t('duration.1h'), value: 3600 },
    { label: t('duration.6h'), value: 21600 },
    { label: t('duration.12h'), value: 43200 },
    { label: t('duration.1d'), value: 86400 },
    { label: t('duration.3d'), value: 259200 },
    { label: t('duration.7d'), value: 604800 }
  ].filter(o => o.value >= (minDuration ?? 0) && o.value <= (maxDuration ?? Infinity));

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-stone-700">
        <h2 className="text-xl font-bold text-white uppercase tracking-[1px]">{t('create.title')}</h2>
        <button onClick={onClose} className="text-stone-400 hover:text-white text-lg">✕</button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Item Selection */}
        <div>
          <label className="block text-stone-300 text-sm mb-2">{t('create.select_item')}</label>
          <input
            type="text"
            placeholder={t('create.search_inventory')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white placeholder-stone-500 focus:outline-none focus:border-amber-600 mb-2"
          />
          <div className="max-h-52 overflow-y-auto border border-stone-700 rounded-lg">
            {filteredInventory.length === 0 ? (
              <p className="p-3 text-stone-500 text-sm text-center">
                {t('create.no_items')}
              </p>
            ) : (
              filteredInventory.map((item) => (
                  <div
                    key={item.slot}
                    onClick={() => {
                      setSelectedItem(item);
                      setCount(1);
                    }}
                    className={`flex justify-between items-center p-3 cursor-pointer transition-colors ${
                      selectedItem?.slot === item.slot
                        ? 'bg-amber-900/50 border-l-2 border-amber-500'
                        : 'hover:bg-stone-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <AsyncImage
                        imageMeta={item.imageMeta}
                        alt={item.label}
                        className="w-8 h-8 rounded"
                      />
                      <div>
                        <p className="text-white text-sm">{item.label}</p>
                        <p className="text-stone-500 text-xs">{item.name}</p>
                      </div>
                    </div>
                    <span className="text-stone-400 text-sm">x{item.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {selectedItem && (
            <>
              {/* Quantity */}
              <div>
                <label className="block text-stone-300 text-sm mb-2">{t('create.quantity')}</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCount(Math.max(1, count - 1))}
                    className="w-10 h-10 bg-stone-800 border border-stone-700 rounded-lg text-white hover:bg-stone-700"
                  >-</button>
                  <input
                    type="number"
                    min={1}
                    max={selectedItem.count}
                    value={count}
                    onChange={(e) => setCount(Math.min(selectedItem.count, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-center focus:outline-none focus:border-amber-600"
                  />
                  <button
                    type="button"
                    onClick={() => setCount(Math.min(selectedItem.count, count + 1))}
                    className="w-10 h-10 bg-stone-800 border border-stone-700 rounded-lg text-white hover:bg-stone-700"
                  >+</button>
                  <button
                    type="button"
                    onClick={() => setCount(selectedItem.count)}
                    className="px-3 h-10 bg-stone-800 border border-stone-700 rounded-lg text-stone-300 text-sm hover:bg-stone-700"
                  >{t('create.max')}</button>
                </div>
                <p className="text-stone-500 text-xs mt-1">{t('create.available', selectedItem.count)}</p>
              </div>

              {/* Starting Bid */}
              <div>
                <label className="block text-stone-300 text-sm mb-2">{t('create.starting_bid')}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={t('create.starting_bid_placeholder')}
                  value={startingBidDollars}
                  onChange={(e) => setStartingBidDollars(e.target.value)}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-600"
                />
                <p className="text-stone-500 text-xs mt-1">{t('create.starting_bid_hint')}</p>
              </div>

              {/* Buyout Price */}
              {buyoutConfig?.enabled && (
                <div>
                  <label className="block text-stone-300 text-sm mb-2">{t('create.buyout_optional')}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={t('create.buyout_empty_hint')}
                    value={buyoutDollars}
                    onChange={(e) => setBuyoutDollars(e.target.value)}
                    className={`w-full bg-stone-800 border rounded-lg px-3 py-2 text-white focus:outline-none ${
                      buyoutDollars && !isBuyoutValid ? 'border-red-600 focus:border-red-500' : 'border-stone-700 focus:border-amber-600'
                    }`}
                  />
                  {buyoutDollars && !isBuyoutValid && (
                    <p className="text-red-400 text-xs mt-1">
                      {t('create.min_buyout', Money.format(minBuyoutCents), `${buyoutConfig.minMultiplier}x`)}
                    </p>
                  )}
                  {buyoutDollars && isBuyoutValid && (
                    <p className="text-emerald-400 text-xs mt-1">
                      {t('create.buyout_summary', Money.format(buyoutCents))}
                    </p>
                  )}
                  {!buyoutDollars && (
                    <p className="text-stone-500 text-xs mt-1">
                      {t('create.min_buyout', Money.format(minBuyoutCents), `${buyoutConfig.minMultiplier}x`)}
                    </p>
                  )}
                </div>
              )}

              {/* Duration */}
              <div>
                <label className="block text-stone-300 text-sm mb-2">{t('create.duration')}</label>
                <Dropdown value={duration} options={durationOptions} onChange={setDuration} />
              </div>

              {/* Category */}
              <div>
                <label className="block text-stone-300 text-sm mb-2">{t('create.category')}</label>
                <Dropdown
                  value={selectedCategory}
                  placeholder={t('create.select_category')}
                  options={(categories || []).map(cat => ({ value: cat.id, label: `${cat.icon} ${cat.label}` }))}
                  onChange={setSelectedCategory}
                />
              </div>

              {/* Fee Breakdown */}
              {localFeePreview.enabled && (
                <div className={`rounded-lg p-4 border ${
                  canAffordFee
                    ? 'bg-stone-800/50 border-stone-700'
                    : 'bg-red-950/50 border-red-800'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-stone-400 text-xs uppercase tracking-wide">{t('create.creation_fee')}</h4>
                    <span className={`text-lg font-bold ${canAffordFee ? 'text-amber-400' : 'text-red-400'}`}>
                      {Money.format(localFeePreview.totalCents)}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-stone-500">{t('create.base_fee')}</span>
                      <span className="text-stone-300">{Money.format(localFeePreview.baseFeeCents)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">{t('create.duration_fee', (duration / 3600).toFixed(1), Money.format(feeConfig?.durationMultiplier ? Money.dollarsToCents(feeConfig.durationMultiplier) : 200))}</span>
                      <span className="text-stone-300">{Money.format(localFeePreview.durationFeeCents)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">{t('create.quantity_fee', count, Money.format(feeConfig?.quantityMultiplier ? Money.dollarsToCents(feeConfig.quantityMultiplier) : 50))}</span>
                      <span className="text-stone-300">{Money.format(localFeePreview.quantityFeeCents)}</span>
                    </div>
                    {localFeePreview.wasCapped && (
                      <div className="flex justify-between text-amber-400">
                        <span>{t('create.fee_capped')}</span>
                        <span>{Money.format(localFeePreview.maxFeeCents || 0)}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-stone-700/50 flex justify-between text-xs">
                    <span className="text-stone-500">{t('create.your_funds')}</span>
                    <span className={canAffordFee ? 'text-emerald-400' : 'text-red-400'}>
                      {Money.formatWithCommas(playerFundsCents)}
                    </span>
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="bg-stone-800/50 rounded-lg p-4 border border-stone-700">
                <h4 className="text-stone-400 text-xs uppercase tracking-wide mb-3">{t('create.summary')}</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-stone-400">{t('create.summary_item')}</span>
                    <span className="text-white">{selectedItem.label} x{count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-400">{t('create.summary_category')}</span>
                    <span className={selectedCategory ? 'text-amber-400' : 'text-red-400'}>
                      {selectedCategoryLabel || t('create.select_category')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-400">{t('create.summary_starting_bid')}</span>
                    <span className="text-amber-400">{Money.format(Money.parseToCents(startingBidDollars))}</span>
                  </div>
                  {buyoutDollars && isBuyoutValid && (
                    <div className="flex justify-between">
                      <span className="text-stone-400">{t('create.summary_buyout')}</span>
                      <span className="text-emerald-400">{Money.format(buyoutCents)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-stone-400">{t('create.summary_duration')}</span>
                    <span className="text-white">{durationOptions.find(o => o.value === duration)?.label}</span>
                  </div>
                  {localFeePreview.enabled && (
                    <div className="flex justify-between">
                      <span className="text-stone-400">{t('create.summary_fee')}</span>
                      <span className={canAffordFee ? 'text-amber-400' : 'text-red-400'}>{Money.format(localFeePreview.totalCents)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting || !canAffordFee || !selectedCategory}
                className={`w-full font-semibold py-3 rounded-lg transition-colors ${
                  isSubmitting || !canAffordFee || !selectedCategory
                    ? 'bg-stone-700 text-stone-400 cursor-not-allowed'
                    : 'bg-amber-700 hover:bg-amber-600 text-white'
                }`}
              >
                {!selectedCategory
                  ? t('create.submit_select_category')
                  : !canAffordFee
                    ? t('create.submit_insufficient_funds', Money.format(localFeePreview.totalCents))
                    : isSubmitting
                      ? t('create.submit_creating')
                      : t('create.submit_create', Money.format(localFeePreview.totalCents))
                }
              </button>
            </>
          )}
        </form>
    </div>
  );
}

// Auction Detail View Component
function AuctionDetailView({
  auction,
  bidHistory,
  playerCitizenid,
  playerFundsCents,
  onPlaceBid,
  onBuyout,
  onCancel,
  onBack,
  categories,
  minBidIncrement = 0.05
}: {
  auction: Auction;
  bidHistory: BidEntry[];
  playerCitizenid: string;
  playerFundsCents: { cashCents: number; bankCents: number };
  onPlaceBid: (amountCents: number) => void;
  onBuyout: () => void;
  onCancel: () => void;
  onBack: () => void;
  categories?: Category[];
  minBidIncrement?: number;
}) {
  const [bidAmountDollars, setBidAmountDollars] = useState<string>('');
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [showConfirmBuyout, setShowConfirmBuyout] = useState(false);

  const isOwnAuction = auction.owner.citizenid === playerCitizenid;
  const isHighestBidder = !!auction.highestBidder && auction.highestBidder.citizenid === playerCitizenid;
  const categoryInfo = getCategoryInfo(auction.category, categories);
  const totalFundsCents = playerFundsCents.cashCents + playerFundsCents.bankCents;
  const currentBidCents = auction.currentBidCents || 0;
  const startingBidCents = auction.startingBidCents || 0;
  const buyoutPriceCents = auction.buyoutPriceCents || 0;
  const minBidCents = currentBidCents > 0 
    ? Math.max(currentBidCents + 1, Math.ceil(currentBidCents * (1 + minBidIncrement)))
    : startingBidCents;
  const canBid = !isOwnAuction && auction.status === 'active' && totalFundsCents >= minBidCents;
  const canBuyout = !isOwnAuction && auction.status === 'active' && buyoutPriceCents > currentBidCents && totalFundsCents >= buyoutPriceCents;
  const canCancel = isOwnAuction && auction.totalBids === 0 && auction.status === 'active';

  const handleBid = () => {
    const bidCents = Money.parseToCents(bidAmountDollars);
    if (bidCents >= minBidCents && bidCents <= totalFundsCents) {
      onPlaceBid(bidCents);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-stone-700">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-stone-400 hover:text-white text-lg">←</button>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white uppercase tracking-[1px]">{auction.item.label}</h2>
            <p className="text-stone-500 text-xs">{t('detail.auction_id', auction.id)}</p>
          </div>
          {isOwnAuction && (
            <span className="px-2 py-0.5 text-xs bg-amber-800 text-amber-200 rounded">{t('detail.your_auction')}</span>
          )}
          {isHighestBidder && !isOwnAuction && (
            <span className="px-2 py-0.5 text-xs bg-emerald-800 text-emerald-200 rounded">{t('detail.winning_label')}</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Item Info */}
        <div className="p-4 border-b border-stone-700/50">
          <div className="flex gap-4">
            <AsyncImage 
              imageMeta={auction.item.imageMeta}
              alt={auction.item.label}
              className="w-24 h-24 bg-stone-800 rounded-lg border border-stone-700"
            />
            <div className="flex-1">
              <p className="text-white font-medium">{auction.item.label}</p>
              <p className="text-stone-500 text-sm">{t('auction.quantity', auction.item.count)}</p>
              {categoryInfo && (
                <p className="text-stone-400 text-sm mt-1">
                    {t('auction.category', `${categoryInfo.icon} ${categoryInfo.label}`)}
                </p>
              )}
              <p className="text-stone-500 text-sm mt-1">{t('auction.seller', auction.owner.name)}</p>
            </div>
          </div>
        </div>

        {/* Bidding Section */}
        {auction.status === 'active' && (
          <div className="p-4 border-b border-stone-700/50">
            <div className="flex justify-between items-center mb-3">
              <div>
                <p className="text-stone-500 text-xs">{t('auction.current_bid')}</p>
                <p className="text-2xl font-bold text-amber-400">
                  {Money.formatWithCommas(currentBidCents > 0 ? currentBidCents : startingBidCents)}
                </p>
              </div>
              <div className="text-right">
          <p className="text-stone-500 text-xs">{t('auction.ends_in')}</p>
                <p className="text-lg"><CountdownTimer endTime={auction.endTime} /></p>
              </div>
            </div>

            {auction.highestBidder && (
              <p className="text-stone-400 text-sm mb-3">
                {t('detail.highest_bidder', '')}<span className="text-white">{auction.highestBidder.name}</span>
              </p>
            )}

            {/* Buyout Section */}
            {buyoutPriceCents > 0 && (
              <div className="mb-4 p-3 bg-emerald-950/50 border border-emerald-800/50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-emerald-400 text-sm font-medium">{t('detail.buyout_price')}</span>
                  <span className="text-emerald-300 text-lg font-bold">{Money.format(buyoutPriceCents)}</span>
                </div>
                {!isOwnAuction && (
                  showConfirmBuyout ? (
                    <div className="space-y-2">
                      <p className="text-emerald-300 text-sm">{t('detail.buy_instantly', Money.format(buyoutPriceCents))}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={onBuyout}
                          className="flex-1 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold"
                        >
                          {t('detail.yes_buy_now')}
                        </button>
                        <button
                          onClick={() => setShowConfirmBuyout(false)}
                          className="flex-1 py-2 bg-stone-800 hover:bg-stone-700 text-white rounded-lg text-sm"
                        >
                          {t('detail.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowConfirmBuyout(true)}
                      disabled={!canBuyout}
                      className={`w-full py-2 rounded-lg font-semibold transition-colors ${
                        canBuyout
                          ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
                          : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                      }`}
                    >
                      {totalFundsCents < buyoutPriceCents ? t('detail.insufficient_funds') : t('detail.buy_now')}
                    </button>
                  )
                )}
                {isOwnAuction && (
                  <p className="text-stone-500 text-xs text-center">{t('detail.cant_buy_own')}</p>
                )}
              </div>
            )}

            {!isOwnAuction && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={t('detail.enter_bid')}
                    value={bidAmountDollars}
                    onChange={(e) => setBidAmountDollars(e.target.value)}
                    className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-600"
                  />
                  <button
                    onClick={() => setBidAmountDollars(Money.centsToDollars(minBidCents).toFixed(2))}
                    className="px-3 bg-stone-800 border border-stone-700 rounded-lg text-stone-300 text-sm hover:bg-stone-700"
                  >
                    {t('detail.min')}
                  </button>
                </div>
                <p className="text-stone-500 text-xs">
                  {t('detail.min_bid', Money.format(minBidCents))} | {t('detail.your_funds', Money.formatWithCommas(totalFundsCents))}
                </p>
                <button
                  onClick={handleBid}
                  disabled={!canBid || Money.parseToCents(bidAmountDollars) < minBidCents}
                  className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                    canBid && Money.parseToCents(bidAmountDollars) >= minBidCents
                      ? 'bg-amber-700 hover:bg-amber-600 text-white'
                      : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                  }`}
                >
                  {totalFundsCents < minBidCents ? t('detail.insufficient_funds') : t('detail.place_bid', Money.format(Money.parseToCents(bidAmountDollars)))}
                </button>
              </div>
            )}

            {canCancel && (
              <div className="mt-4 pt-4 border-t border-stone-700/50">
                {showConfirmCancel ? (
                  <div className="space-y-2">
                    <p className="text-amber-400 text-sm">{t('detail.cancel_auction_confirm')}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={onCancel}
                        className="flex-1 py-2 bg-red-800 hover:bg-red-700 text-white rounded-lg text-sm"
                      >
                        {t('detail.yes_cancel')}
                        </button>
                        <button
                          onClick={() => setShowConfirmCancel(false)}
                          className="flex-1 py-2 bg-stone-800 hover:bg-stone-700 text-white rounded-lg text-sm"
                        >
                          {t('detail.no_keep')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowConfirmCancel(true)}
                    className="w-full py-2 bg-stone-800 hover:bg-stone-700 text-stone-400 rounded-lg text-sm"
                  >
                    {t('detail.cancel_auction')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bid History */}
        <div className="p-4">
          <h3 className="text-white font-medium mb-3">{t('detail.bid_history', auction.totalBids)}</h3>
          {bidHistory.length === 0 ? (
            <p className="text-stone-500 text-sm text-center py-4">{t('detail.no_bids')}</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {bidHistory.map((bid, index) => (
                <div
                  key={index}
                  className={`flex justify-between items-center p-2 rounded ${
                    bid.citizenid === playerCitizenid ? 'bg-amber-900/30' : 'bg-stone-800/50'
                  }`}
                >
                  <div>
                    <p className="text-white text-sm">{bid.playerName}</p>
                    <p className="text-stone-500 text-xs">
                      {new Date(bid.timestamp * 1000).toLocaleTimeString()}
                    </p>
                  </div>
                  <span className="text-amber-400 font-medium">{Money.format(bid.amountCents)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Category Sidebar Component
function CategorySidebar({
  categories,
  selectedCategory,
  onSelectCategory,
  visible = true
}: {
  categories?: Category[];
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
  visible?: boolean;
}) {
  if (!visible || !categories || categories.length === 0) return null;

  const buttonBaseClass = "rdr-nav w-full text-left px-3 py-2 mb-1 transition-colors flex items-center gap-2 focus:outline-none";

  return (
    <div className="w-48 border-r border-stone-700 flex flex-col bg-stone-900/30">
      <div className="p-3 border-b border-stone-700">
        <h3 className="rdr-subtitle !text-left">{t('category.title')}</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <button
          onClick={() => onSelectCategory('')}
          className={`${buttonBaseClass} ${
            !selectedCategory ? 'is-active' : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <span className="text-base">📦</span>
          <span>{t('category.all_items')}</span>
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => onSelectCategory(cat.id)}
            className={`${buttonBaseClass} ${
              selectedCategory === cat.id ? 'is-active' : 'text-stone-400 hover:text-stone-200'
            }`}
            title={cat.description}
          >
            <span className="text-base">{cat.icon}</span>
            <span className="truncate">{cat.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Collection Kiosk Component
function CollectionKiosk({
  pendingCollections,
  onCollectItem,
  onCollectMoney,
  collectingItem,
  collectingMoney,
  onBack
}: {
  pendingCollections: PendingCollections;
  onCollectItem: (auctionId: string, itemName: string) => void;
  onCollectMoney: () => void;
  collectingItem: string | null;
  collectingMoney: boolean;
  onBack: () => void;
}) {
  const hasItems = pendingCollections.items.length > 0;
  const hasMoney = pendingCollections.money && (pendingCollections.money.amountCents || 0) > 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-stone-700">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-stone-400 hover:text-white text-lg">←</button>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white uppercase tracking-[1px]">{t('collect.title')}</h2>
            <p className="text-stone-500 text-xs">{t('collect.subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* No collections message */}
        {!hasItems && !hasMoney && (
          <div className="h-64 flex items-center justify-center">
            <div className="text-center">
              <p className="text-4xl text-stone-700 mb-2">📭</p>
              <p className="text-stone-500">{t('collect.no_pending')}</p>
              <p className="text-stone-600 text-sm mt-1">{t('collect.hint')}</p>
            </div>
          </div>
        )}

        {/* Money Section */}
        {hasMoney && (
          <div className="bg-gradient-to-r from-amber-900/40 to-amber-800/20 border border-amber-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-amber-800/50 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">💰</span>
                </div>
                <div>
                  <p className="text-amber-300 text-sm font-medium">{t('collect.sales_earnings')}</p>
                  <p className="text-white text-2xl font-bold">
                    {Money.formatWithCommas(pendingCollections.money!.amountCents || 0)}
                  </p>
                  <p className="text-stone-400 text-xs mt-1">
                    {pendingCollections.money!.reason}
                    {pendingCollections.money!.itemName && ` - ${pendingCollections.money!.itemName}`}
                  </p>
                </div>
              </div>
              <button
                onClick={onCollectMoney}
                disabled={collectingMoney}
                className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                  collectingMoney
                    ? 'bg-stone-700 text-stone-400 cursor-wait'
                    : 'bg-amber-700 hover:bg-amber-600 text-white'
                }`}
              >
                {collectingMoney ? t('collect.collecting') : t('collect.collect')}
              </button>
            </div>
          </div>
        )}

        {/* Items Section */}
        {hasItems && (
          <div>
            <h3 className="text-stone-400 text-sm font-medium mb-3 uppercase tracking-wide">
              {t('collect.won_items', pendingCollections.items.length)}
            </h3>
            <div className="space-y-3">
              {pendingCollections.items.map((item, index) => (
                <div
                  key={`${item.auctionId}-${index}`}
                  className="rdr-row p-4"
                >
                  <div className="flex items-center gap-4">
                    <AsyncImage
                      imageMeta={item.imageMeta}
                      alt={item.itemLabel}
                      className="w-16 h-16 rounded-lg flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{item.itemLabel}</p>
                      <p className="text-stone-400 text-sm">{t('auction.qty', item.count)}</p>
                      {(item.soldForCents || 0) > 0 && (
                        <p className="text-amber-400 text-sm mt-1">
                          {t('auction.won_for', Money.format(item.soldForCents))}
                        </p>
                      )}
                      <p className="text-stone-500 text-xs mt-1">
                        {t('collect.from', item.sellerName)}
                      </p>
                    </div>
                    <button
                      onClick={() => onCollectItem(item.auctionId, item.itemName)}
                      disabled={collectingItem === item.auctionId}
                      className={`px-5 py-2.5 rounded-lg font-medium transition-colors ${
                        collectingItem === item.auctionId
                          ? 'bg-stone-700 text-stone-400 cursor-wait'
                          : 'bg-emerald-700 hover:bg-emerald-600 text-white'
                      }`}
                    >
                      {collectingItem === item.auctionId ? t('collect.collecting') : t('collect.collect')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      {(hasItems || hasMoney) && (
        <div className="p-4 border-t border-stone-700 bg-stone-900/50">
          <p className="text-stone-500 text-xs text-center">
            {t('collect.footer')}
          </p>
        </div>
      )}
    </div>
  );
}

// Main App Component
export default function App() {
  const [visible, setVisible] = useState(isDebug);
  const [view, setView] = useState<'list' | 'create' | 'detail' | 'collect'>('list');
  const [playerData, setPlayerData] = useState<PlayerData>({
    inventory: [],
    cashCents: 0,
    bankCents: 0,
    citizenid: '',
    playerName: ''
  });
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [bidHistory, setBidHistory] = useState<Record<string, BidEntry[]>>({});
  const [selectedAuctionId, setSelectedAuctionId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'mine'>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // New state for view toggle, search, and pagination
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    totalCount: 0,
    totalPages: 0,
    hasMore: false,
    query: ''
  });
  const [isSearching, setIsSearching] = useState(false);
  const [pendingCollections, setPendingCollections] = useState<PendingCollections>({ money: null, items: [] });
  const [collectingItem, setCollectingItem] = useState<string | null>(null);
  const [collectingMoney, setCollectingMoney] = useState(false);

  // Add notification helper
  const addNotification = useCallback((notification: Omit<Notification, 'id'>) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { ...notification, id }]);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // NUI Event Handlers
  useNuiEvent('open', (data: PlayerData) => {
    setLocale(data.locale);
    setPlayerData(data);
    setVisible(true);
    setView('list');
  });

  useNuiEvent('close', () => {
    setVisible(false);
    setView('list');
    setSelectedAuctionId(null);
  });

  useNuiEvent('receiveAuctions', (data: { auctions: Auction[]; bidHistory: Record<string, BidEntry[]> }) => {
    setAuctions(data.auctions);
    setBidHistory(data.bidHistory || {});
    setPagination(prev => ({
      ...prev,
      totalCount: data.auctions.length,
      totalPages: Math.ceil(data.auctions.length / prev.limit),
      hasMore: data.auctions.length > prev.limit
    }));
  });

  useNuiEvent('receiveSearchResults', (data: { auctions: Auction[]; bidHistory: Record<string, BidEntry[]>; pagination: Pagination }) => {
    setAuctions(data.auctions);
    setBidHistory(data.bidHistory || {});
    setPagination(data.pagination);
    setIsSearching(false);
  });

  // Broadcast to every open UI: just refresh if it's this town's market. The creator's own
  // view switch + toast happen in createResult (previously every player got kicked to the list).
  useNuiEvent('auctionCreated', (auction: Auction) => {
    if (auction.location && playerData.location && auction.location !== playerData.location) return;
    handleSearch(searchQuery, pagination.page);
  });

  // Broadcast to everyone: update state silently. The bidder gets their own toast via bidResult.
  useNuiEvent('bidPlaced', (data: { auctionId: string; currentBidCents: number; highestBidder: Player; totalBids: number; endTime?: number; bidHistory: BidEntry[] }) => {
    setAuctions(prev => prev.map(a => 
      a.id === data.auctionId 
        ? { ...a, currentBidCents: data.currentBidCents, highestBidder: data.highestBidder, totalBids: data.totalBids, endTime: data.endTime ?? a.endTime }
        : a
    ));
    setBidHistory(prev => ({ ...prev, [data.auctionId]: data.bidHistory }));
  });

  useNuiEvent('auctionEnded', (data: { auctionId: string; location?: string }) => {
    if (data.location && playerData.location && data.location !== playerData.location) return;
    handleSearch(searchQuery, pagination.page);
    if (selectedAuctionId === data.auctionId) {
      setSelectedAuctionId(null);
      setView('list');
    }
  });

  useNuiEvent('auctionCancelled', (data: { auctionId: string; location?: string }) => {
    if (data.location && playerData.location && data.location !== playerData.location) return;
    handleSearch(searchQuery, pagination.page);
    if (selectedAuctionId === data.auctionId) {
      setSelectedAuctionId(null);
      setView('list');
      addNotification({
        type: 'info',
        title: t('notif.cancel_title'),
        message: t('notif.auction_cancelled')
      });
    }
  });

  useNuiEvent('notification', (data: { type: string; auctionId?: string; itemName: string; count?: number; amountCents?: number; newHighBidCents?: number; message?: string }) => {
    const titles: Record<string, string> = {
      outbid: t('notif.outbid_title'),
      won: t('notif.won_title'),
      lost: t('notif.lost_title'),
      sold: t('notif.sold_title'),
      expired: t('notif.expired_title'),
      info: t('notif.notification')
    };

    const messages: Record<string, string> = {
      outbid: t('notif.outbid_msg', data.itemName, Money.formatWithCommas(data.newHighBidCents ?? 0)),
      won: t('notif.won_msg', data.itemName, data.count ? ` x${data.count}` : '', Money.formatWithCommas(data.amountCents ?? 0)),
      lost: t('notif.lost_msg', data.itemName),
      sold: t('notif.sold_msg', data.itemName, data.count ? ` x${data.count}` : '', Money.formatWithCommas(data.amountCents ?? 0)),
      expired: t('notif.expired_msg', data.itemName),
      info: data.message || ''
    };
    if (data.type === 'outbid' && data.message) messages.outbid = data.message;

    addNotification({
      type: data.type as Notification['type'],
      title: titles[data.type] || t('notif.notification'),
      message: messages[data.type] || ''
    });
  });

  useNuiEvent('createResult', (result: { success: boolean; error?: string; auction?: Auction }) => {
    setIsSubmitting(false);
    if (result.success && result.auction) {
      setView('list');
      addNotification({
        type: 'success',
        title: t('notif.auction_created_title'),
        message: t('notif.auction_created', result.auction.item.label, result.auction.id)
      });
    } else if (!result.success && result.error) {
      addNotification({
        type: 'error',
        title: t('notif.error'),
        message: result.error
      });
    }
  });

  useNuiEvent('bidResult', (result: { success: boolean; error?: string; auction?: Auction; minBid?: number }) => {
    if (result.success && result.auction) {
      addNotification({
        type: 'success',
        title: t('notif.bid_placed_title'),
        message: t('notif.bid_placed', Money.formatWithCommas(result.auction.currentBidCents))
      });
    } else if (!result.success && result.error) {
      addNotification({
        type: 'error',
        title: t('notif.bid_failed'),
        message: result.error
      });
    }
  });

  useNuiEvent('buyoutResult', (result: { success: boolean; error?: string; auction?: Auction }) => {
    if (result.success) {
      // Refresh to remove the purchased auction
      handleSearch(searchQuery, pagination.page);
      if (selectedAuctionId === result.auction?.id) {
        setSelectedAuctionId(null);
        setView('list');
      }
      addNotification({
        type: 'success',
        title: t('notif.purchase_complete'),
        message: t('notif.purchased_item', result.auction?.item?.label || '', Money.format(result.auction?.buyoutPriceCents || 0))
      });
    } else if (result.error) {
      addNotification({
        type: 'error',
        title: t('notif.purchase_failed'),
        message: result.error
      });
    }
  });

  useNuiEvent('cancelResult', (result: { success: boolean; error?: string }) => {
    if (!result.success && result.error) {
      addNotification({
        type: 'error',
        title: t('notif.cancel_failed'),
        message: result.error
      });
    }
  });

  useNuiEvent('inventoryUpdated', (data: { inventory: InventoryItem[] }) => {
    setPlayerData(prev => ({ ...prev, inventory: data.inventory }));
  });

  // Balance update handler - receives real-time balance changes from server
  useNuiEvent('balanceUpdated', (data: { cashCents: number; bankCents: number }) => {
    setPlayerData(prev => ({ ...prev, cashCents: data.cashCents, bankCents: data.bankCents }));
  });

  // Collection system event handlers
  useNuiEvent('receivePendingCollections', (data: PendingCollections) => {
    setPendingCollections(data);
  });

  useNuiEvent('collectionResult', (result: { success: boolean; error?: string; type: 'item' | 'money'; itemName?: string; itemLabel?: string; count?: number; amountCents?: number }) => {
    if (result.success) {
      if (result.type === 'item') {
        // Server pushes the refreshed pending list straight after a successful collection
        setCollectingItem(null);
        addNotification({
          type: 'success',
          title: t('notif.item_collected_title'),
          message: t('notif.collected_item', result.itemLabel || '', result.count || 0)
        });
      } else if (result.type === 'money') {
        setCollectingMoney(false);
        setPendingCollections(prev => ({ ...prev, money: null }));
        addNotification({
          type: 'success',
          title: t('notif.money_collected_title'),
          message: t('notif.money_collected', Money.formatWithCommas(result.amountCents ?? 0))
        });
      }
    } else {
      setCollectingItem(null);
      setCollectingMoney(false);
      addNotification({
        type: 'error',
        title: t('notif.collection_failed'),
        message: result.error || t('notif.unknown_error')
      });
    }
  });

  // NUI Actions
  const handleClose = useCallback(() => {
    setVisible(false);
    fetchNui('close', {}, { success: true });
  }, []);

  const handleCreateAuction = useCallback((data: { itemName: string; slot: number; count: number; startingBid: number; duration: number; category: string; buyoutPrice?: number }) => {
    setIsSubmitting(true);
    fetchNui('createAuction', data, { success: true });
  }, []);

  const handlePlaceBid = useCallback((auctionId: string, amountCents: number) => {
    fetchNui('placeBid', { auctionId, amountCents }, { success: true });
  }, []);

  const handleCancelAuction = useCallback((auctionId: string) => {
    fetchNui('cancelAuction', { auctionId }, { success: true });
  }, []);

  const handleBuyoutAuction = useCallback((auctionId: string) => {
    fetchNui('buyoutAuction', { auctionId }, { success: true });
  }, []);

  // Collection handlers
  const handleGetPendingCollections = useCallback(() => {
    fetchNui('getPendingCollections', {}, { money: null, items: [] });
  }, []);

  const handleCollectItem = useCallback((auctionId: string, itemName: string) => {
    setCollectingItem(auctionId);
    fetchNui('collectItem', { auctionId, itemName }, { success: true });
  }, []);

  const handleCollectMoney = useCallback(() => {
    setCollectingMoney(true);
    fetchNui('collectMoney', {}, { success: true });
  }, []);

  // Search and pagination handlers
  const handleSearch = useCallback((query: string, page: number = 1, category?: string) => {
    setIsSearching(true);
    const effectiveCategory = category !== undefined ? category : categoryFilter;
    fetchNui('searchAuctions', {
      query,
      page,
      limit: pagination.limit,
      filterOwn: activeTab === 'mine',
      category: effectiveCategory || undefined
    }, { success: true });
  }, [pagination.limit, activeTab, categoryFilter]);

  const handlePageChange = useCallback((newPage: number) => {
    handleSearch(searchQuery, newPage);
  }, [handleSearch, searchQuery]);

  // Debounced search
  useEffect(() => {
    if (!visible) return;
    
    const timer = setTimeout(() => {
      if (searchQuery !== pagination.query || searchQuery.length > 0 || categoryFilter) {
        handleSearch(searchQuery, 1);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchQuery, categoryFilter, visible]);

  // ESC key handler
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClose]);

  // Mock data for development
  useEffect(() => {
    if (isDebug) {
      setPlayerData({
        inventory: [
          { name: 'gold_nugget', label: 'Gold Nugget', count: 5, slot: 1, metadata: {} },
          { name: 'revolver_schofield', label: 'Schofield Revolver', count: 1, slot: 2, metadata: { condition: 85 } },
          { name: 'meat_deer', label: 'Deer Meat', count: 12, slot: 3, metadata: {} },
          { name: 'arrow_improved', label: 'Improved Arrows', count: 24, slot: 4, metadata: {} },
          { name: 'pelt_bear', label: 'Bear Pelt', count: 1, slot: 5, metadata: { quality: 'perfect' } },
        ],
        cashCents: 50000,
        bankCents: 250000,
        location: 'valentine',
        locationLabel: 'Valentine',
        minBidIncrement: 0.05,
        citizenid: 'player1',
        playerName: 'Test Player',
        feeConfig: {
          enabled: true,
          baseFee: 5,
          durationMultiplier: 2,
          quantityMultiplier: 0.5,
          maxFee: 500,
          minFee: 5
        },
        buyoutConfig: {
          enabled: true,
          minMultiplier: 1.5
        },
        categories: [
          { id: 'weapons', label: 'Weapons', icon: '🔫', description: 'Firearms, melee weapons, and ammunition' },
          { id: 'ammunition', label: 'Ammunition', icon: '🎯', description: 'Bullets, arrows, and throwing weapons' },
          { id: 'clothing', label: 'Clothing', icon: '👒', description: 'Apparel, hats, and accessories' },
          { id: 'food', label: 'Food & Drink', icon: '🥩', description: 'Consumables, provisions, and beverages' },
          { id: 'resources', label: 'Resources', icon: '🪨', description: 'Ores, minerals, and raw materials' },
          { id: 'pelts', label: 'Pelts & Hides', icon: '🦌', description: 'Animal pelts, hides, and taxidermy' },
          { id: 'medicine', label: 'Medicine', icon: '💊', description: 'Tonics, medicines, and healing items' },
          { id: 'tools', label: 'Tools', icon: '🔧', description: 'Tools, kits, and crafting supplies' },
          { id: 'valuables', label: 'Valuables', icon: '💎', description: 'Jewelry, gold, and valuable items' },
          { id: 'other', label: 'Other', icon: '📦', description: 'Miscellaneous items' }
        ]
      });

      setAuctions([
        {
          id: 'AUC_1',
          owner: { name: 'John Marston', citizenid: 'citizen2' },
          item: { name: 'gold_nugget', label: 'Gold Nugget', count: 10, metadata: {} },
          category: 'valuables',
          startingBidCents: 10000,
          currentBidCents: 25000,
          highestBidder: { name: 'Arthur Morgan', citizenid: 'citizen3' },
          endTime: Math.floor(Date.now() / 1000) + 1800,
          createdAt: Math.floor(Date.now() / 1000) - 3600,
          status: 'active',
          totalBids: 5
        },
        {
          id: 'AUC_2',
          owner: { name: 'Dutch van der Linde', citizenid: 'citizen4' },
          item: { name: 'revolver_schofield', label: 'Schofield Revolver', count: 1, metadata: { condition: 90 } },
          category: 'weapons',
          startingBidCents: 50000,
          currentBidCents: 0,
          buyoutPriceCents: 150000,
          highestBidder: null,
          endTime: Math.floor(Date.now() / 1000) + 3600,
          createdAt: Math.floor(Date.now() / 1000) - 1800,
          status: 'active',
          totalBids: 0
        },
        {
          id: 'AUC_3',
          owner: { name: 'Sadie Adler', citizenid: 'citizen5' },
          item: { name: 'pelt_bear', label: 'Perfect Bear Pelt', count: 1, metadata: { quality: 'perfect' } },
          category: 'pelts',
          startingBidCents: 20000,
          currentBidCents: 35000,
          highestBidder: { name: 'Test Player', citizenid: 'player1' },
          endTime: Math.floor(Date.now() / 1000) + 120,
          createdAt: Math.floor(Date.now() / 1000) - 7200,
          status: 'active',
          totalBids: 3
        }
      ]);

      setBidHistory({
        'AUC_1': [
          { playerName: 'Arthur Morgan', citizenid: 'citizen3', amountCents: 25000, timestamp: Math.floor(Date.now() / 1000) - 300 },
          { playerName: 'Charles Smith', citizenid: 'citizen6', amountCents: 20000, timestamp: Math.floor(Date.now() / 1000) - 900 },
          { playerName: 'Arthur Morgan', citizenid: 'citizen3', amountCents: 15000, timestamp: Math.floor(Date.now() / 1000) - 1500 },
          { playerName: 'Javier Escuella', citizenid: 'citizen7', amountCents: 10000, timestamp: Math.floor(Date.now() / 1000) - 2100 },
        ],
        'AUC_3': [
          { playerName: 'Test Player', citizenid: 'player1', amountCents: 35000, timestamp: Math.floor(Date.now() / 1000) - 600 },
          { playerName: 'Hosea Matthews', citizenid: 'citizen8', amountCents: 20000, timestamp: Math.floor(Date.now() / 1000) - 1200 },
        ]
      });

      // Mock pending collections
      setPendingCollections({
        money: {
          amountCents: 125000,
          reason: 'auction-sale'
        },
        items: [
          {
            itemName: 'pelt_bear',
            itemLabel: 'Perfect Bear Pelt',
            count: 1,
            metadata: { quality: 'perfect' },
            auctionId: 'AUC_3',
            image: 'nui://rsg-inventory/html/images/pelt_bear.png',
            imageMeta: {
              url: 'nui://rsg-inventory/html/images/pelt_bear.png',
              itemName: 'pelt_bear',
              fallbackUrl: 'nui://rsg-auction/web/dist/fallback.svg'
            },
            soldForCents: 35000,
            sellerName: 'Sadie Adler'
          },
          {
            itemName: 'gold_nugget',
            itemLabel: 'Gold Nugget',
            count: 5,
            metadata: {},
            auctionId: 'AUC_5',
            image: 'nui://rsg-inventory/html/images/gold_nugget.png',
            imageMeta: {
              url: 'nui://rsg-inventory/html/images/gold_nugget.png',
              itemName: 'gold_nugget',
              fallbackUrl: 'nui://rsg-auction/web/dist/fallback.svg'
            },
            soldForCents: 50000,
            sellerName: 'Dutch van der Linde'
          }
        ]
      });
    }
  }, []);

  if (!visible) return null;

  const selectedAuction = selectedAuctionId ? auctions.find(a => a.id === selectedAuctionId) : null;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4">
      {/* Notification Stack */}
      <div className="fixed bottom-4 right-4 w-80 flex flex-col-reverse gap-[10px] z-50">
        {notifications.map(notification => (
          <NotificationToast
            key={notification.id}
            notification={notification}
            onDismiss={() => removeNotification(notification.id)}
          />
        ))}
      </div>

      {/* Main Container */}
      <div className="rdr-panel w-[1150px] max-w-[95vw] h-[780px] max-h-[90vh] flex overflow-hidden">
        {/* Navigation Sidebar */}
        <div className="w-56 border-r border-stone-700 flex flex-col flex-shrink-0">
          <div className="relative px-9 pt-5 pb-3 border-b border-stone-700">
            <button onClick={handleClose} className="rdr-icon-btn absolute top-2 right-2 !w-7 !h-7 text-xs" title={t('nav.close')}>✕</button>
            <h1 className="rdr-title !text-xl">{t('nav.auction_house')}</h1>
            <p className="rdr-subtitle mt-1">{playerData.locationLabel || ''}</p>
            <div className="rdr-divider">♦</div>
            <p className="rdr-desc text-xs text-center">{t('nav.welcome', playerData.playerName)}</p>
          </div>

          {/* Player Funds */}
          <div className="p-4 border-b border-stone-700/50">
            <p className="rdr-subtitle !text-left !tracking-[2px] mb-1">{t('nav.available_funds')}</p>
            <p className="text-amber-400 text-lg font-semibold">
              {Money.formatWithCommas(playerData.cashCents + playerData.bankCents)}
            </p>
            <p className="text-stone-500 text-xs mt-1">
              {t('nav.cash', Money.format(playerData.cashCents))} | {t('nav.bank', Money.formatWithCommas(playerData.bankCents))}
            </p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4">
            <button
              onClick={() => { setView('list'); setSelectedAuctionId(null); }}
              className={`rdr-nav w-full text-left px-3 py-2 mb-1 transition-colors ${
                view === 'list' || view === 'detail' ? 'is-active' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {t('nav.browse')}
            </button>
            <button
              onClick={() => setView('create')}
              className={`rdr-nav w-full text-left px-3 py-2 mb-1 transition-colors ${
                view === 'create' ? 'is-active' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {t('nav.create')}
            </button>
            <button
              onClick={() => {
                setView('collect');
                handleGetPendingCollections();
              }}
              className={`rdr-nav w-full text-left px-3 py-2 mb-1 transition-colors flex items-center justify-between ${
                view === 'collect' ? 'is-active' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <span>{t('nav.collect')}</span>
              {(pendingCollections.items.length > 0 || pendingCollections.money) && (
                <span className="rdr-pill text-white text-[10px] px-2 py-0.5">
                  {pendingCollections.items.length + (pendingCollections.money ? 1 : 0)}
                </span>
              )}
            </button>
          </nav>

          {/* Close Button */}
          <div className="p-4 border-t border-stone-700">
            <button
              onClick={handleClose}
              className="w-full py-2 bg-stone-800 hover:bg-stone-700 text-stone-400 rounded-lg text-sm transition-colors"
            >
              {t('nav.close')}
            </button>
          </div>
        </div>

        {/* Category Sidebar - Only visible in list view */}
        <CategorySidebar
          categories={playerData.categories}
          selectedCategory={categoryFilter}
          onSelectCategory={(categoryId) => {
            setCategoryFilter(categoryId);
            handleSearch(searchQuery, 1, categoryId);
          }}
          visible={view === 'list'}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {view === 'list' && (
            <>
              {/* Header with Tabs and Search */}
              <div className="p-4 border-b border-stone-700 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setActiveTab('all');
                        setSearchQuery('');
                        setCategoryFilter('');
                        handleSearch('', 1, '');
                      }}
                      className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                        activeTab === 'all' ? 'bg-amber-700 text-white' : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
                      }`}
                    >
                      {t('tab.all')}
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('mine');
                        setSearchQuery('');
                        setCategoryFilter('');
                        handleSearch('', 1, '');
                      }}
                      className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                        activeTab === 'mine' ? 'bg-amber-700 text-white' : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
                      }`}
                    >
                      {t('tab.mine')}
                    </button>
                  </div>
                  <button
                    onClick={() => setView('create')}
                    className="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      {t('tab.new_auction')}
                    </button>
                </div>
                
                {/* Search Bar and View Toggle */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      placeholder={t('search.placeholder')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white placeholder-stone-500 focus:outline-none focus:border-amber-600 pr-8"
                    />
                    {isSearching && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>
                  
                  {/* View Toggle */}
                  <div className="flex bg-stone-800 border border-stone-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setViewMode('card')}
                      className={`px-3 py-2 text-sm transition-colors ${
                        viewMode === 'card' ? 'bg-amber-700 text-white' : 'text-stone-400 hover:text-white'
                      }`}
                      title={t('view.card')}
                    >
                      ▦
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`px-3 py-2 text-sm transition-colors ${
                        viewMode === 'list' ? 'bg-amber-700 text-white' : 'text-stone-400 hover:text-white'
                      }`}
                      title={t('view.list')}
                    >
                      ☰
                    </button>
                  </div>
                </div>
                
                {/* Results Count with active category indicator */}
                <div className="flex items-center justify-between text-xs text-stone-500">
                  <span>
                    {pagination.totalCount > 0 
                      ? t('search.count', pagination.totalCount)
                      : t('search.no_auctions')
                    }
                    {categoryFilter && (
                      <span className="text-amber-400 ml-1">
                        {t('search.in_category', playerData.categories?.find(c => c.id === categoryFilter)?.label || 'category')}
                      </span>
                    )}
                    {searchQuery && t('search.for_query', searchQuery)}
                  </span>
                  {pagination.totalPages > 1 && (
                    <span>{t('search.page', pagination.page, pagination.totalPages)}</span>
                  )}
                </div>
              </div>

              {/* Auction List/Grid */}
              <div className="flex-1 overflow-y-auto p-4">
                {auctions.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-4xl text-stone-700 mb-2">📦</p>
                      <p className="text-stone-500">
                        {searchQuery ? t('search.no_results') : t('search.no_auctions')}
                      </p>
                      {!searchQuery && (
                        <button
                          onClick={() => setView('create')}
                          className="mt-4 px-4 py-2 bg-amber-700 hover:bg-amber-600 text-white rounded-lg text-sm"
                        >
                          {t('search.create_first')}
                        </button>
                      )}
                    </div>
                  </div>
                ) : viewMode === 'card' ? (
                  <div className="grid grid-cols-2 gap-3">
                    {auctions.map(auction => (
                      <AuctionCard
                        key={auction.id}
                        auction={auction}
                        playerCitizenid={playerData.citizenid}
                        isSelected={selectedAuctionId === auction.id}
                        categories={playerData.categories}
                        onSelect={() => {
                          setSelectedAuctionId(auction.id);
                          setView('detail');
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {auctions.map(auction => (
                      <AuctionListRow
                        key={auction.id}
                        auction={auction}
                        playerCitizenid={playerData.citizenid}
                        categories={playerData.categories}
                        isSelected={selectedAuctionId === auction.id}
                        onSelect={() => {
                          setSelectedAuctionId(auction.id);
                          setView('detail');
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
              
              {/* Pagination Controls */}
              {pagination.totalPages > 1 && (
                <div className="p-4 border-t border-stone-700 flex items-center justify-center gap-2">
                  <button
                    onClick={() => handlePageChange(1)}
                    disabled={pagination.page === 1}
                    className="px-3 py-1.5 bg-stone-800 border border-stone-700 rounded-lg text-stone-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {t('pagination.first')}
                    </button>
                    <button
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page === 1}
                      className="px-3 py-1.5 bg-stone-800 border border-stone-700 rounded-lg text-stone-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {t('pagination.prev')}
                    </button>
                  
                  {/* Page Numbers */}
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (pagination.totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (pagination.page <= 3) {
                        pageNum = i + 1;
                      } else if (pagination.page >= pagination.totalPages - 2) {
                        pageNum = pagination.totalPages - 4 + i;
                      } else {
                        pageNum = pagination.page - 2 + i;
                      }
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          className={`w-8 h-8 rounded-lg text-sm transition-colors ${
                            pagination.page === pageNum
                              ? 'bg-amber-700 text-white'
                              : 'bg-stone-800 text-stone-400 hover:text-white'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={!pagination.hasMore}
                    className="px-3 py-1.5 bg-stone-800 border border-stone-700 rounded-lg text-stone-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {t('pagination.next')}
                    </button>
                    <button
                      onClick={() => handlePageChange(pagination.totalPages)}
                      disabled={!pagination.hasMore}
                      className="px-3 py-1.5 bg-stone-800 border border-stone-700 rounded-lg text-stone-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {t('pagination.last')}
                    </button>
                </div>
              )}
            </>
          )}

          {view === 'create' && (
            <CreateAuctionForm
              inventory={playerData.inventory}
              onCreate={handleCreateAuction}
              onClose={() => setView('list')}
              isSubmitting={isSubmitting}
              feeConfig={playerData.feeConfig}
              buyoutConfig={playerData.buyoutConfig}
              playerFundsCents={playerData.cashCents + playerData.bankCents}
              categories={playerData.categories}
              minDuration={playerData.minDuration}
              maxDuration={playerData.maxDuration}
              blacklist={playerData.blacklist}
            />
          )}

          {view === 'detail' && selectedAuction && (
            <AuctionDetailView
              auction={selectedAuction}
              bidHistory={bidHistory[selectedAuction.id] || []}
              playerCitizenid={playerData.citizenid}
              playerFundsCents={{ cashCents: playerData.cashCents, bankCents: playerData.bankCents }}
              onPlaceBid={(amountCents) => handlePlaceBid(selectedAuction.id, amountCents)}
              onBuyout={() => handleBuyoutAuction(selectedAuction.id)}
              onCancel={() => handleCancelAuction(selectedAuction.id)}
              onBack={() => { setView('list'); setSelectedAuctionId(null); }}
              categories={playerData.categories}
              minBidIncrement={playerData.minBidIncrement}
            />
          )}

          {view === 'collect' && (
            <CollectionKiosk
              pendingCollections={pendingCollections}
              onCollectItem={handleCollectItem}
              onCollectMoney={handleCollectMoney}
              collectingItem={collectingItem}
              collectingMoney={collectingMoney}
              onBack={() => setView('list')}
            />
          )}
        </div>
      </div>

    </div>
  );
}
