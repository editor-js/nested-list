import { OrderedListRenderer } from '../ListRenderer/OrderedListRenderer';
import { UnorderedListRenderer } from '../ListRenderer/UnorderedListRenderer';
import type { NestedListConfig, ListData, ListDataStyle } from '../types/ListParams';
import type { ListItem } from '../types/ListParams';
import type { ItemElement, ItemContentElement, ItemChildWrapperElement } from '../types/Elements';
import { isHtmlElement } from '../utils/type-guards';
import { getContenteditableSlice, getCaretNodeAndOffset, focus, isCaretAtStartOfInput, save as saveCaret } from '@editorjs/caret';
import { DefaultListCssClasses } from '../ListRenderer';
import type { PasteEvent } from '../types';
import type { API, BlockAPI, PasteConfig } from '@editorjs/editorjs';
import type { ListParams } from '..';
import type { ChecklistItemMeta, OrderedListItemMeta, UnorderedListItemMeta } from '../types/ItemMeta';
import type { ListRenderer } from '../types/ListRenderer';
import { getSiblings } from '../utils/getSiblings';
import { getChildItems } from '../utils/getChildItems';
import { isLastItem } from '../utils/isLastItem';
import { itemHasSublist } from '../utils/itemHasSublist';
import { getItemChildWrapper } from '../utils/getItemChildWrapper';
import { removeChildWrapperIfEmpty } from '../utils/removeChildWrapperIfEmpty';
import { getItemContentElement } from '../utils/getItemContentElement';
import { focusItem } from '../utils/focusItem';

/**
 * Class that is responsible for list tabulation
 */
export default class ListTabulator<Renderer extends ListRenderer> {
  /**
   * The Editor.js API
   */
  private api: API;

  /**
   * Is NestedList Tool read-only option
   */
  private readOnly: boolean;

  /**
   * Tool's configuration
   */
  private config?: NestedListConfig;

  /**
   * Full content of the list
   */
  private data: ListData;

  /**
   * Editor block api
   */
  private block: BlockAPI;

  /**
   * Rendered list of items
   */
  renderer: Renderer;

  /**
   * Wrapper of the whole list
   */
  listWrapper: ItemChildWrapperElement | undefined;

  /**
   * Returns current List item by the caret position
   * @returns
   */
  get currentItem(): ItemElement | null {
    const selection = window.getSelection();

    if (!selection) {
      return null;
    }
    let currentNode = selection.anchorNode;

    if (!currentNode) {
      return null;
    }

    if (!isHtmlElement(currentNode)) {
      currentNode = currentNode.parentNode;
    }
    if (!currentNode) {
      return null;
    }
    if (!isHtmlElement(currentNode)) {
      return null;
    }

    return currentNode.closest(`.${DefaultListCssClasses.item}`);
  }

  constructor({ data, config, api, readOnly, block }: ListParams, renderer: Renderer) {
    this.config = config;
    this.data = data;
    this.readOnly = readOnly;
    this.api = api;
    this.block = block;

    this.renderer = renderer;
  }

  /**
   * Function that is responsible for rendering nested list with contents
   * @returns Filled with content wrapper element of the list
   */
  render() {
    this.listWrapper = this.renderer.renderWrapper(true);

    // fill with data
    if (this.data.items.length) {
      this.appendItems(this.data.items, this.listWrapper);
    } else {
      this.appendItems(
        [
          {
            content: '',
            meta: {},
            items: [],
          },
        ],
        this.listWrapper
      );
    }

    if (!this.readOnly) {
      // detect keydown on the last item to escape List
      this.listWrapper.addEventListener(
        'keydown',
        (event) => {
          switch (event.key) {
            case 'Enter':
              this.enterPressed(event);
              break;
            case 'Backspace':
              this.backspace(event);
              break;
            case 'Tab':
              if (event.shiftKey) {
                this.shiftTab(event);
              } else {
                this.addTab(event);
              }
              break;
          }
        },
        false
      );
    }

    return this.listWrapper;
  }

  /**
   * Renders children list
   * @param list - initialized ListRenderer instance
   * @param items - items data to append
   * @param parentItem - where to append
   * @param parentElement
   * @returns
   */
  appendItems(items: ListItem[], parentElement: Element): void {
    items.forEach((item) => {
      const itemEl = this.renderItem(item.content, item.meta);

      parentElement.appendChild(itemEl);

      /**
       * Check if there are child items
       */
      if (item.items.length) {
        const sublistWrapper = this.renderer?.renderWrapper(false);

        /**
         * Recursively render child items
         */
        this.appendItems(item.items, sublistWrapper);

        if (itemEl) {
          itemEl.appendChild(sublistWrapper);
        }
      }
    });
  }

  /**
   * Function that is responsible for list content saving
   * @param wrapper - optional argument wrapper
   * @returns whole list saved data if wrapper not passes, otherwise will return data of the passed wrapper
   */
  save(wrapper?: ItemChildWrapperElement): ListData {
    const listWrapper = wrapper ?? this.listWrapper;

    /**
     * The method for recursive collecting of the child items
     * @param parent - where to find items
     * @returns
     */
    const getItems = (parent: ItemChildWrapperElement): ListItem[] => {
      const children = getChildItems(parent);

      return children.map((el) => {
        const subItemsWrapper = getItemChildWrapper(el);
        const content = this.renderer.getItemContent(el);
        const meta = this.renderer.getItemMeta(el);
        const subItems = subItemsWrapper ? getItems(subItemsWrapper) : [];

        return {
          content,
          meta,
          items: subItems,
        };
      });
    };

    return {
      style: this.data.style,
      items: listWrapper ? getItems(listWrapper) : [],
    };
  }

  /**
   * On paste sanitzation config. Allow only tags that are allowed in the Tool.
   * @returns - paste config.
   */
  static get pasteConfig(): PasteConfig {
    return {
      tags: ['OL', 'UL', 'LI'],
    };
  }

  /**
   * Method that specified hot to merge two List blocks.
   * Called by Editor.js by backspace at the beginning of the Block
   *
   * Content of the first item of the next List would be merged with deepest item in current list
   * Other items of the next List would be appended to the current list without any changes in nesting levels
   * @param data - data of the second list to be merged with current
   */
  merge(data: ListData): void {
    /**
     * Get list of all levels children of the previous item
     */
    const items = this.block.holder.querySelectorAll<ItemElement>(`.${DefaultListCssClasses.item}`);

    const deepestBlockItem = items[items.length - 1];
    const deepestBlockItemContentElement = getItemContentElement(deepestBlockItem);

    if (deepestBlockItem === null || deepestBlockItemContentElement === null) {
      return;
    }

    focus(deepestBlockItemContentElement);

    const restore = saveCaret();

    /**
     * Insert trailing html to the deepest block item content
     */
    deepestBlockItemContentElement.insertAdjacentHTML('beforeend', data.items[0].content);

    restore();

    if (this.listWrapper === undefined) {
      return;
    }

    const firstLevelItems = getChildItems(this.listWrapper);

    if (firstLevelItems.length === 0) {
      return;
    }

    /**
     * Get last item of the first level of the list
     */
    const lastFirstLevelItem = firstLevelItems[firstLevelItems.length - 1];

    /**
     * Get child items wrapper of the last item
     */
    let lastFirstLevelItemChildWrapper = getItemChildWrapper(lastFirstLevelItem);

    /**
     * Get first item of the list to be merged with current one
     */
    const firstItem = data.items.shift();

    /**
     * Check that first item exists
     */
    if (firstItem === undefined) {
      return;
    }

    /**
     * Append child items of the first element
     */
    if (firstItem.items.length !== 0) {
      /**
       * Render child wrapper of the last item if it does not exist
       */
      if (lastFirstLevelItemChildWrapper === null) {
        lastFirstLevelItemChildWrapper = this.renderer.renderWrapper(false);
      }

      this.appendItems(firstItem.items, lastFirstLevelItemChildWrapper);
    }

    if (data.items.length > 0) {
      this.appendItems(data.items, this.listWrapper);
    }
  }

  /**
   * On paste callback that is fired from Editor.
   * @param event - event with pasted data
   */
  onPaste(event: PasteEvent): void {
    const list = event.detail.data;

    this.data = this.pasteHandler(list);

    // render new list
    const oldView = this.listWrapper;

    if (oldView && oldView.parentNode) {
      oldView.parentNode.replaceChild(this.render(), oldView);
    }
  }

  /**
   * Handle UL, OL and LI tags paste and returns List data
   * @param element
   * @returns
   */
  pasteHandler(element: PasteEvent['detail']['data']): ListData {
    const { tagName: tag } = element;
    let style: ListDataStyle = 'unordered';
    let tagToSearch: string;

    // set list style and tag to search.
    switch (tag) {
      case 'OL':
        style = 'ordered';
        tagToSearch = 'ol';
        break;
      case 'UL':
      case 'LI':
        style = 'unordered';
        tagToSearch = 'ul';
    }

    const data: ListData = {
      style,
      items: [],
    };

    // get pasted items from the html.
    const getPastedItems = (parent: Element): ListItem[] => {
      // get first level li elements.
      const children = Array.from(parent.querySelectorAll(`:scope > li`));

      return children.map((child) => {
        // get subitems if they exist.
        const subItemsWrapper = child.querySelector(`:scope > ${tagToSearch}`);
        // get subitems.
        const subItems = subItemsWrapper ? getPastedItems(subItemsWrapper) : [];
        // get text content of the li element.
        const content = child?.firstChild?.textContent || '';

        return {
          content,
          meta: {},
          items: subItems,
        };
      });
    };

    // get pasted items.
    data.items = getPastedItems(element);

    return data;
  }

  /**
   * Handles Enter keypress
   * @param event - keydown
   * @returns
   */
  enterPressed(event: KeyboardEvent): void {
    const currentItem = this.currentItem;

    /**
     * Prevent editor.js behaviour
     */
    event.stopPropagation();

    /**
     * Prevent browser behaviour
     */
    event.preventDefault();

    /**
     * Prevent duplicated event in Chinese, Japanese and Korean languages
     */
    if (event.isComposing) {
      return;
    }
    if (currentItem === null) {
      return;
    }

    const isEmpty = currentItem
      ? this.renderer?.getItemContent(currentItem).trim().length === 0
      : true;
    const isFirstLevelItem = currentItem.parentNode === this.listWrapper;

    /**
     * On Enter in the last empty item, get out of list
     */
    if (isFirstLevelItem && isEmpty) {
      if (isLastItem(currentItem) && !itemHasSublist(currentItem)) {
        this.getOutOfList();

        return;
      }
      /**
       * If enter is pressed in the сenter of the list item we should split it
       */
      else {
        this.splitList(currentItem);

        return;
      }
    }
    /**
     * If currnet item is empty and is in the middle of the list
     * And if current item is not on the first level
     * Then unshift current item
     */
    else if (isEmpty) {
      this.unshiftItem(currentItem);

      return;
    }
    /**
     * If current item is not empty than split current item
     */
    else {
      this.splitItem(currentItem);
    }
  }

  /**
   * Handle backspace
   * @param event - keydown
   */
  backspace(event: KeyboardEvent): void {
    const currentItem = this.currentItem;

    if (currentItem === null) {
      return;
    }

    /**
     * Caret is not at start of the item
     * Then backspace button should remove letter as usual
     */
    if (!isCaretAtStartOfInput(currentItem)) {
      return;
    }

    /**
     * Prevent default backspace behaviour
     */
    event.preventDefault();

    this.mergeItemWithPrevious(currentItem);
  }

  /**
   * Reduce indentation for current item
   * @param event - keydown
   * @returns
   */
  shiftTab(event: KeyboardEvent): void {
    /**
     * Prevent editor.js behaviour
     */
    event.stopPropagation();

    /**
     * Prevent browser tab behaviour
     */
    event.preventDefault();

    /**
     * Check that current item exists
     */
    if (this.currentItem === null) {
      return;
    }

    /**
     * Move item from current list to parent list
     */
    this.unshiftItem(this.currentItem);
  }

  /**
   * Decrease indentation of the passed item
   * @param item
   * @returns
   */
  unshiftItem(item: ItemElement): void {
    if (!item.parentNode) {
      return;
    }
    if (!isHtmlElement(item.parentNode)) {
      return;
    }

    const parentItem = item.parentNode.closest<ItemElement>(`.${DefaultListCssClasses.item}`);

    /**
     * If item in the first-level list then no need to do anything
     */
    if (!parentItem) {
      return;
    }

    let currentItemChildWrapper = getItemChildWrapper(item);

    if (item.parentElement === null) {
      return;
    }

    const siblings = getSiblings(item);

    /**
     * If item has any siblings, they should be appended to item child wrapper
     */
    if (siblings !== null) {
      /**
       * Render child wrapper if it does no exist
       */
      if (currentItemChildWrapper === null) {
        currentItemChildWrapper = this.renderer.renderWrapper(false);
      }

      /**
       * Append siblings to item child wrapper
       */
      siblings.forEach((sibling) => {
        currentItemChildWrapper!.appendChild(sibling);
      });

      item.appendChild(currentItemChildWrapper);
    }

    const restore = saveCaret();

    parentItem.after(item);

    restore();

    /**
     * If previous parent's children list is now empty, remove it.
     */
    const parentItemChildWrapper = getItemChildWrapper(parentItem);

    if (!parentItemChildWrapper) {
      return;
    }

    removeChildWrapperIfEmpty(parentItemChildWrapper);
  }

  /**
   * Method that is used for list splitting and moving trailing items to the new separated list
   * @param item - current item html element
   */
  splitList(item: ItemElement): void {
    const currentItemChildrenList = getChildItems(item);

    /**
     * First child item should be unshifted because separated list should start
     * with item with first nesting level
     */
    if (currentItemChildrenList.length !== 0) {
      const firstChildItem = currentItemChildrenList[0];

      this.unshiftItem(firstChildItem);
    }

    /**
     * Get trailing siblings of the current item
     */
    const newListItems = getSiblings(item);

    if (newListItems === null) {
      return;
    }

    /**
     * Render new wrapper for list that would be separated
     */
    const newListWrapper = this.renderer.renderWrapper(true);

    /**
     * Append new list wrapper with trailing elements
     */
    newListItems.forEach((item) => {
      newListWrapper.appendChild(item);
    });

    const newListContent = this.save(newListWrapper);

    /**
     * Get current list block index
     */
    const currentBlock = this.block;

    const currentBlockIndex = this.api.blocks.getCurrentBlockIndex();

    /**
     * Insert separated list with trailing items
     */
    this.api.blocks.insert(currentBlock?.name, newListContent, this.config, currentBlockIndex + 1);

    /**
     * Insert paragraph
     */
    this.getOutOfList(currentBlockIndex + 1);

    /**
     * Remove temporary new list wrapper used for content save
     */
    newListWrapper.remove();
  }

  /**
   * Method that is used for splitting item content and moving trailing content to the new sibling item
   * @param currentItem - current item html element
   */
  splitItem(currentItem: ItemElement): void {
    const [currentNode, offset] = getCaretNodeAndOffset();

    if (currentNode === null) {
      return;
    }

    const currentItemContent = getItemContentElement(currentItem);

    let endingHTML: string;

    /**
     * If current item has no content, we should pass an empty string to the next created list item
     */
    if (currentItemContent === null) {
      endingHTML = '';
    } else {
      /**
       * On other Enters, get content from caret till the end of the block
       * And move it to the new item
       */
      endingHTML = getContenteditableSlice(currentItemContent, currentNode, offset, 'right', true);
    }

    const itemChildren = getItemChildWrapper(currentItem);
    /**
     * Create the new list item
     */
    const itemEl = this.renderItem(endingHTML);

    /**
     * Move new item after current
     */
    currentItem?.after(itemEl);

    /**
     * If current item has children, move them to the new item
     */
    if (itemChildren) {
      itemEl.appendChild(itemChildren);
    }

    focusItem(itemEl);
  }

  /**
   * Method that is used for merging current item with previous one
   * Content of the current item would be appended to the previous item
   * Current item children would not change nesting level
   * @param currentItem - current item html element
   * @param item
   */
  mergeItemWithPrevious(item: ItemElement): void {
    const previousItem = item.previousElementSibling;

    const currentItemParentNode = item.parentNode;

    /**
     * Check that parent node of the current element exists
     */
    if (currentItemParentNode === null) {
      return;
    }
    if (!isHtmlElement(currentItemParentNode)) {
      return;
    }

    const parentItem = currentItemParentNode.closest<ItemElement>(`.${DefaultListCssClasses.item}`);

    /**
     * Check that current item has any previous siblings to be merged with
     */
    if (!previousItem && !parentItem) {
      return;
    }

    /**
     * Make sure previousItem is an HTMLElement
     */
    if (previousItem && !isHtmlElement(previousItem)) {
      return;
    }

    /**
     * Lets compute the item which will be merged with current item text
     */
    let targetItem: ItemElement | null;

    /**
     * If there is a previous item then we get a deepest item in its sublists
     *
     * Otherwise we will use the parent item
     */
    if (previousItem) {
      /**
       * Get list of all levels children of the previous item
       */
      const childrenOfPreviousItem = getChildItems(previousItem, false);

      /**
       * Target item would be deepest child of the previous item or previous item itself
       */
      if (childrenOfPreviousItem.length !== 0 && childrenOfPreviousItem.length !== 0) {
        targetItem = childrenOfPreviousItem[childrenOfPreviousItem.length - 1];
      } else {
        targetItem = previousItem;
      }
    } else {
      targetItem = parentItem;
    }

    /**
     * Get current item content
     */
    const currentItemContent = this.renderer.getItemContent(item);

    /**
     * Get the target item content element
     */
    if (!targetItem) {
      return;
    }

    /**
     * Get target item content element
     */
    const targetItemContentElement = getItemContentElement(targetItem);

    /**
     * Set a new place for caret
     */
    if (!targetItemContentElement) {
      return;
    }
    focus(targetItemContentElement, false);

    /**
     * Save the caret position
     */
    const restore = saveCaret();

    /**
     * Update target item content by merging with current item html content
     */
    targetItemContentElement.insertAdjacentHTML('beforeend', currentItemContent);

    /**
     * Get child list of the currentItem
     */
    const currentItemChildrenList = getChildItems(item);

    /**
     * Check that current item has any children
     */
    if (currentItemChildrenList.length === 0) {
      /**
       * Remove current item element
       */
      item.remove();

      /**
       * Restore the caret position
       */
      restore();

      return;
    }

    /**
     * Get target for child list of the currentItem
     * Note that previous item and parent item could not be null at the same time
     * This case is checked before
     */
    const targetForChildItems = previousItem ? previousItem : parentItem!;

    const targetChildWrapper = getItemChildWrapper(targetForChildItems) ?? this.renderer.renderWrapper(false);

    /**
     * Add child current item children to the target childWrapper
     */
    if (previousItem) {
      currentItemChildrenList.forEach((childItem) => {
        targetChildWrapper.appendChild(childItem);
      });
    } else {
      currentItemChildrenList.forEach((childItem) => {
        targetChildWrapper.prepend(childItem);
      });
    }

    /**
     * If we created new wrapper, then append childWrapper to the target item
     */
    if (getItemChildWrapper(targetForChildItems) === null) {
      targetItem.appendChild(targetChildWrapper);
    }

    /**
     * Remove current item element
     */
    item.remove();

    /**
     * Restore the caret position
     */
    restore();
  }

  /**
   * Add indentation to current item
   * @param event - keydown
   */
  addTab(event: KeyboardEvent): void {
    /**
     * Prevent editor.js behaviour
     */
    event.stopPropagation();

    /**
     * Prevent browser tab behaviour
     */
    event.preventDefault();

    const currentItem = this.currentItem;

    if (!currentItem) {
      return;
    }

    /**
     * Check that the item has potential parent
     * Previous sibling is potential parent in case of adding tab
     * After adding tab current item would be moved to the previous sibling's child list
     */
    const prevItem = currentItem.previousSibling;

    if (prevItem === null) {
      return;
    }
    if (!isHtmlElement(prevItem)) {
      return;
    }

    const prevItemChildrenList = getItemChildWrapper(prevItem);

    const restore = saveCaret();

    /**
     * If prev item has child items, just append current to them
     * Else render new child wrapper for previous item
     */
    if (prevItemChildrenList) {
      /**
       * Previous item would be appended with current item and it's sublists
       * After that sublists would be moved one level back
       */
      prevItemChildrenList.appendChild(currentItem);

      /**
       * Get all current item child to be moved to previous nesting level
       */
      const currentItemChildrenList = getChildItems(currentItem);

      /**
       * Move current item sublists one level back
       */
      currentItemChildrenList.forEach((child) => {
        prevItemChildrenList.appendChild(child);
      });
    } else {
      const prevItemChildrenListWrapper = this.renderer.renderWrapper(false);

      /**
       * Previous item would be appended with current item and it's sublists
       * After that sublists would be moved one level back
       */
      prevItemChildrenListWrapper.appendChild(currentItem);

      /**
       * Get all current item child to be moved to previous nesting level
       */
      const currentItemChildrenList = getChildItems(currentItem);

      /**
       * Move current item sublists one level back
       */
      currentItemChildrenList.forEach((child) => {
        prevItemChildrenListWrapper.appendChild(child);
      });

      prevItem.appendChild(prevItemChildrenListWrapper);
    }

    restore();
  }

  /**
   * Get out from List Tool by Enter on the empty last item
   * @param index - optional parameter represents index, where would be inseted default block
   * @returns
   */
  getOutOfList(index?: number): void {
    let newBlock;

    /**
     * Check that index passed
     */
    if (index !== undefined) {
      newBlock = this.api.blocks.insert(undefined, undefined, undefined, index);
    } else {
      newBlock = this.api.blocks.insert();
    }

    this.currentItem?.remove();
    this.api.caret.setToBlock(newBlock);
  }

  /**
   * Method that calls render function of the renderer with a necessary item meta cast
   * @param item - item to be rendered
   * @param itemContent
   * @param meta
   * @returns html element of the rendered item
   */
  renderItem(itemContent: ListItem['content'], meta?: ListItem['meta']): ItemElement {
    const itemMeta = meta ?? this.renderer.composeDefaultMeta();

    switch (true) {
      case this.renderer instanceof OrderedListRenderer:
        return this.renderer.renderItem(itemContent, itemMeta);

      case this.renderer instanceof UnorderedListRenderer:
        return this.renderer.renderItem(itemContent, itemMeta);

      default:
        return this.renderer.renderItem(itemContent, itemMeta as ChecklistItemMeta);
    }
  }
}
