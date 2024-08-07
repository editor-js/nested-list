/**
 * Meta information of each list item
 */
interface ItemMeta {};

/**
 * Meta information of checklist item
 */
export interface ChecklistItemMeta extends ItemMeta {
  /**
   * State of the checkbox of the item
   */
  checked: boolean;
};

/**
 * Meta information of ordered list item
 */
export interface OrderedListItemMeta extends ItemMeta {};

/**
 * Meta information of unordered list item
 */
export interface UnorderedListItemMeta extends ItemMeta {};