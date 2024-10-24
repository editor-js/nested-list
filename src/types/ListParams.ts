import type { ChecklistItemMeta, OrderedListItemMeta, UnorderedListItemMeta } from './ItemMeta';

/**
 * list style to make list as ordered or unordered
 */
export type ListDataStyle = 'ordered' | 'unordered' | 'checklist';

/**
 * Output data
 */
export interface ListData {
  /**
   * list type 'ordered' or 'unordered' or 'checklist'
   */
  style: ListDataStyle;
  /**
   * list of first-level elements
   */
  items: ListItem[];
  /**
   * Start property used only in ordered list
   */
  start?: number;
  /**
   * Max level of the nesting in list
   * If nesting is not needed, it could be set to 1
   */
  maxLevel?: number;
}

/**
 * List item within the output data
 */
export interface ListItem {
  /**
   * list item text content
   */
  content: string;

  /**
   * Meta information of each list item
   */
  meta: OrderedListItemMeta | UnorderedListItemMeta | ChecklistItemMeta;

  /**
   * sublist items
   */
  items: ListItem[];
}

/**
 * Tool's configuration
 */
export interface NestedListConfig {
  /**
   * default list style: ordered or unordered
   * default is unordered
   */
  defaultStyle?: ListDataStyle;
}
