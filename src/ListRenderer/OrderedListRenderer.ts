import type { OrderedListItemMeta } from "../types/ItemMeta";
import { NestedListConfig } from "../types/ListParams";
import * as Dom from '@editorjs/dom';
import { ListRendererInterface, DefaultListCssClasses, CssPrefix } from './ListRenderer';
import type { ListCssClasses } from './ListRenderer';

/**
 * CSS classes for the Ordered list
 */
interface OrderedListCssClasses extends ListCssClasses {
  orderedList: string;
}

/**
 * Class that is responsible for ordered list rendering
 */
export class OrderedListRenderer implements ListRendererInterface<OrderedListItemMeta> {
  /**
   * Tool's configuration
   */
  protected config?: NestedListConfig;

  /**
   * Is NestedList Tool read-only option
   */
  private readOnly: boolean;

  static get CSS(): OrderedListCssClasses {
    return {
      ...DefaultListCssClasses,
      orderedList: `${CssPrefix}-ordered`,
    }
  }

  constructor(readonly: boolean, config?: NestedListConfig) {
    this.config = config;
    this.readOnly = readonly;
  }

  /**
   * Renders ol wrapper for list
   * @param isRoot - boolean variable that represents level of the wrappre (root or childList)
   * @returns - created html ol element
   */
  renderWrapper(isRoot: boolean): HTMLOListElement {
    let wrapperElement: HTMLOListElement;

    /**
     * Check if it's root level
     */
    if (isRoot === true) {
      wrapperElement = Dom.make('ol', [OrderedListRenderer.CSS.wrapper, OrderedListRenderer.CSS.orderedList]) as HTMLOListElement;
    } else {
      wrapperElement = Dom.make('ol', [OrderedListRenderer.CSS.orderedList, OrderedListRenderer.CSS.itemChildren]) as HTMLOListElement;
    }

    return wrapperElement;
  }
  /**
   * Redners list item element
   * @param content - content of the list item
   * @returns - created html list item element
   */
  renderItem(content: string, meta: OrderedListItemMeta): HTMLLIElement {
    const itemWrapper = Dom.make('li', OrderedListRenderer.CSS.item);
    const itemContent = Dom.make('div', OrderedListRenderer.CSS.itemContent, {
      innerHTML: content,
      contentEditable: (!this.readOnly).toString(),
    });

    itemWrapper.appendChild(itemContent);

    return itemWrapper as HTMLLIElement;
  }

  /**
   * Return the item content
   *
   * @param {Element} item - item wrapper (<li>)
   * @returns {string}
   */
  getItemContent(item: Element): string {
    const contentNode = item.querySelector(`.${OrderedListRenderer.CSS.itemContent}`);
    if (!contentNode) {
      return '';
    }

    if (Dom.isEmpty(contentNode)) {
      return '';
    }

    return contentNode.innerHTML;
  }

  /**
   * Returns item meta, for ordered list
   * @returns Item meta object
   */
  getItemMeta(): OrderedListItemMeta  {
    return {}
  }
}
