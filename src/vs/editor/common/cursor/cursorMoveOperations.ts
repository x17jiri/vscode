/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from '../../../base/common/strings.js';
import { Constants } from '../../../base/common/uint.js';
import { CursorColumns } from '../core/cursorColumns.js';
import { Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { AtomicTabMoveOperations, Direction } from './cursorAtomicMoveOperations.js';
import { CursorConfiguration, ICursorSimpleModel, SelectionStartKind, SingleCursorState } from '../cursorCommon.js';
import { PositionAffinity } from '../model.js';

export class CursorPosition {
	_cursorPositionBrand: void = undefined;

	constructor(
		public readonly lineNumber: number,
		public readonly column: number,
		public readonly leftoverVisibleColumns: number,
		public readonly columnHint: number | null,
	) { }
}

export class MoveOperations {
	public static leftPosition(model: ICursorSimpleModel, position: Position): Position {
		if (position.column > model.getLineMinColumn(position.lineNumber)) {
			return position.delta(undefined, -strings.prevCharLength(model.getLineContent(position.lineNumber), position.column - 1));
		} else if (position.lineNumber > 1) {
			const newLineNumber = position.lineNumber - 1;
			return new Position(newLineNumber, model.getLineMaxColumn(newLineNumber));
		} else {
			return position;
		}
	}

	private static leftPositionAtomicSoftTabs(model: ICursorSimpleModel, position: Position, tabSize: number): Position {
		if (position.column <= model.getLineIndentColumn(position.lineNumber)) {
			const minColumn = model.getLineMinColumn(position.lineNumber);
			const lineContent = model.getLineContent(position.lineNumber);
			const newPosition = AtomicTabMoveOperations.atomicPosition(lineContent, position.column - 1, tabSize, Direction.Left);
			if (newPosition !== -1 && newPosition + 1 >= minColumn) {
				return new Position(position.lineNumber, newPosition + 1);
			}
		}
		return this.leftPosition(model, position);
	}

	private static left(config: CursorConfiguration, model: ICursorSimpleModel, position: Position): Position {
		return config.stickyTabStops
			? MoveOperations.leftPositionAtomicSoftTabs(model, position, config.tabSize)
			: MoveOperations.leftPosition(model, position);
	}

	/**
	 * @param noOfColumns Must be either `1`
	 * or `Math.round(viewModel.getLineContent(viewLineNumber).length / 2)` (for half lines).
	*/
	public static moveLeft(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean, noOfColumns: number): SingleCursorState {
		const virtualSpace = config.virtualSpace;

		if (cursor.hasSelection() && !inSelectionMode) {
			// If the user has a selection and does not want to extend it,
			// put the cursor at the beginning of the selection.
			const lineNumber = cursor.selection.startLineNumber;
			const column = cursor.selection.startColumn;
			// TODO - is it possible in some cases we should use cursor.leftoverVisibleColumns?
			const leftoverVisibleColumns = virtualSpace ? cursor.selectionStartLeftoverVisibleColumns : 0;
			return new SingleCursorState(
				new Range(lineNumber, column, lineNumber, column),
				SelectionStartKind.Simple,
				leftoverVisibleColumns,
				new Position(lineNumber, column),
				leftoverVisibleColumns,
				null
			);
		}

		const leftoverVisibleColumns = virtualSpace ? cursor.leftoverVisibleColumns : 0;
		// The `-(noOfColumns - 1)` has no effect if noOfColumns === 1.
		// It is ok to do so in the half-line scenario.
		const pos = cursor.position.delta(undefined, -(noOfColumns - 1) + leftoverVisibleColumns);
		// We clip the position before normalization, as normalization is not defined
		// for possibly negative columns.
		const normalizedPos = model.normalizePosition(MoveOperations.clipPositionColumn(pos, model), PositionAffinity.Left);

		const lineNumber = normalizedPos.lineNumber;
		const column = normalizedPos.column;
		if (virtualSpace) {
			const newLeftoverVisibleColumns = (pos.column - normalizedPos.column) - 1;
			if (newLeftoverVisibleColumns >= 0) {
				return new SingleCursorState(
					new Range(lineNumber, column, lineNumber, column),
					SelectionStartKind.Simple,
					newLeftoverVisibleColumns,
					normalizedPos,
					newLeftoverVisibleColumns,
					null
				);
			}
			if (column <= model.getLineMinColumn(lineNumber)) {
				return new SingleCursorState(
					new Range(lineNumber, column, lineNumber, column),
					SelectionStartKind.Simple, 0,
					normalizedPos, 0, null
				);
			}
		}

		const p = MoveOperations.left(config, model, normalizedPos);
		return cursor.move(inSelectionMode, p.lineNumber, p.column, 0, null);
	}

	/**
	 * Adjusts the column so that it is within min/max of the line.
	*/
	private static clipPositionColumn(position: Position, model: ICursorSimpleModel): Position {
		return new Position(
			position.lineNumber,
			MoveOperations.clipRange(position.column, model.getLineMinColumn(position.lineNumber),
				model.getLineMaxColumn(position.lineNumber))
		);
	}

	private static clipRange(value: number, min: number, max: number): number {
		if (value < min) {
			return min;
		}
		if (value > max) {
			return max;
		}
		return value;
	}

	public static rightPosition(model: ICursorSimpleModel, lineNumber: number, column: number): Position {
		if (column < model.getLineMaxColumn(lineNumber)) {
			column = column + strings.nextCharLength(model.getLineContent(lineNumber), column - 1);
		} else if (lineNumber < model.getLineCount()) {
			lineNumber = lineNumber + 1;
			column = model.getLineMinColumn(lineNumber);
		}
		return new Position(lineNumber, column);
	}

	public static rightPositionAtomicSoftTabs(model: ICursorSimpleModel, lineNumber: number, column: number, tabSize: number, indentSize: number): Position {
		if (column < model.getLineIndentColumn(lineNumber)) {
			const lineContent = model.getLineContent(lineNumber);
			const newPosition = AtomicTabMoveOperations.atomicPosition(lineContent, column - 1, tabSize, Direction.Right);
			if (newPosition !== -1) {
				return new Position(lineNumber, newPosition + 1);
			}
		}
		return this.rightPosition(model, lineNumber, column);
	}

	public static right(config: CursorConfiguration, model: ICursorSimpleModel, position: Position): Position {
		return config.stickyTabStops
			? MoveOperations.rightPositionAtomicSoftTabs(model, position.lineNumber, position.column, config.tabSize, config.indentSize)
			: MoveOperations.rightPosition(model, position.lineNumber, position.column);
	}

	public static moveRight(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean, noOfColumns: number): SingleCursorState {
		const virtualSpace = config.virtualSpace;
		const leftoverVisibleColumns = virtualSpace ? cursor.leftoverVisibleColumns : 0;

		if (cursor.hasSelection() && !inSelectionMode) {
			// If we are in selection mode, move right without selection cancels selection and puts cursor at the end of the selection
			const lineNumber = cursor.selection.endLineNumber;
			const column = cursor.selection.endColumn;
			// TODO - is it possible in some cases we should use cursor.selectionStartLeftoverVisibleColumns?
			return new SingleCursorState(
				new Range(lineNumber, column, lineNumber, column),
				SelectionStartKind.Simple,
				leftoverVisibleColumns,
				new Position(lineNumber, column),
				leftoverVisibleColumns,
				null
			);
		}

		const pos = cursor.position.delta(undefined, (noOfColumns - 1) + leftoverVisibleColumns);
		const normalizedPos = model.normalizePosition(MoveOperations.clipPositionColumn(pos, model), PositionAffinity.Right);

		const lineNumber = normalizedPos.lineNumber;
		const column = normalizedPos.column;
		if (virtualSpace) {
			if (column >= model.getLineMaxColumn(lineNumber)) {
				const newLeftoverVisibleColumns = Math.max(0, pos.column - normalizedPos.column) + 1;
				return new SingleCursorState(
					new Range(lineNumber, column, lineNumber, column),
					SelectionStartKind.Simple,
					newLeftoverVisibleColumns,
					normalizedPos,
					newLeftoverVisibleColumns,
					null
				);
			}
		}

		const r = MoveOperations.right(config, model, normalizedPos);
		return cursor.move(inSelectionMode, r.lineNumber, r.column, 0, null);
	}

	public static vertical(config: CursorConfiguration, model: ICursorSimpleModel, lineNumber: number, column: number, leftoverVisibleColumns: number, columnHint: number | null, newLineNumber: number, allowMoveOnEdgeLine: boolean, normalizationAffinity?: PositionAffinity): CursorPosition {
		const virtualSpace = config.virtualSpace;

		let currentVisibleColumn;
		if (columnHint !== null) {
			currentVisibleColumn = columnHint;
		} else {
			currentVisibleColumn =
				CursorColumns.visibleColumnFromColumn(model.getLineContent(lineNumber), column, config.tabSize)
				+ leftoverVisibleColumns;
			columnHint = currentVisibleColumn;
		}

		const lineCount = model.getLineCount();
		lineNumber = newLineNumber;
		if (virtualSpace) {
			lineNumber = Math.max(1, Math.min(lineCount, lineNumber));
			column = config.columnFromVisibleColumn(model, lineNumber, currentVisibleColumn);
		} else {
			const wasOnFirstPosition = (lineNumber === 1 && column === 1);
			const wasOnLastPosition = (lineNumber === lineCount && column === model.getLineMaxColumn(lineNumber));
			const wasAtEdgePosition = (newLineNumber < lineNumber ? wasOnFirstPosition : wasOnLastPosition);

			if (lineNumber < 1) {
				lineNumber = 1;
				if (allowMoveOnEdgeLine) {
					column = model.getLineMinColumn(lineNumber);
				} else {
					column = Math.min(model.getLineMaxColumn(lineNumber), column);
				}
			} else if (lineNumber > lineCount) {
				lineNumber = lineCount;
				if (allowMoveOnEdgeLine) {
					column = model.getLineMaxColumn(lineNumber);
				} else {
					column = Math.min(model.getLineMaxColumn(lineNumber), column);
				}
			} else {
				column = config.columnFromVisibleColumn(model, lineNumber, currentVisibleColumn);
			}

			if (wasAtEdgePosition) {
				columnHint = null;
				leftoverVisibleColumns = 0;
			}
		}

		if (normalizationAffinity !== undefined) {
			const position = new Position(lineNumber, column);
			const newPosition = model.normalizePosition(position, normalizationAffinity);
			lineNumber = newPosition.lineNumber;
			column = newPosition.column;
		}
		if (columnHint !== null) {
			leftoverVisibleColumns =
				currentVisibleColumn
				- CursorColumns.visibleColumnFromColumn(model.getLineContent(lineNumber), column, config.tabSize);
		}
		return new CursorPosition(lineNumber, column, leftoverVisibleColumns, columnHint);
	}

	public static down(config: CursorConfiguration, model: ICursorSimpleModel, lineNumber: number, column: number, leftoverVisibleColumns: number, columnHint: number | null, count: number, allowMoveOnLastLine: boolean): CursorPosition {
		return this.vertical(config, model, lineNumber, column, leftoverVisibleColumns, columnHint, lineNumber + count, allowMoveOnLastLine, PositionAffinity.RightOfInjectedText);
	}

	public static moveDown(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean, linesCount: number): SingleCursorState {
		let lineNumber: number,
			column: number;

		if (cursor.hasSelection() && !inSelectionMode) {
			// If we are in selection mode, move down acts relative to the end of selection
			lineNumber = cursor.selection.endLineNumber;
			column = cursor.selection.endColumn;
		} else {
			lineNumber = cursor.position.lineNumber;
			column = cursor.position.column;
		}

		let i = 0;
		let r: CursorPosition;
		do {
			r = MoveOperations.down(config, model, lineNumber + i, column, cursor.leftoverVisibleColumns, cursor.columnHint, linesCount, true);
			const np = model.normalizePosition(new Position(r.lineNumber, r.column), PositionAffinity.None);
			if (np.lineNumber > lineNumber) {
				break;
			}
		} while (i++ < 10 && lineNumber + i < model.getLineCount());

		return cursor.move(inSelectionMode, r.lineNumber, r.column, r.leftoverVisibleColumns, r.columnHint);
	}

	public static translateDown(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState): SingleCursorState {
		const columnHint = cursor.columnHint;
		const selection = cursor.selection;

		const selectionStart = MoveOperations.down(config, model, selection.selectionStartLineNumber, selection.selectionStartColumn, cursor.selectionStartLeftoverVisibleColumns, columnHint, 1, false);
		const position = MoveOperations.down(config, model, selection.positionLineNumber, selection.positionColumn, cursor.leftoverVisibleColumns, columnHint, 1, false);

		return new SingleCursorState(
			new Range(selectionStart.lineNumber, selectionStart.column, selectionStart.lineNumber, selectionStart.column),
			SelectionStartKind.Simple,
			selectionStart.leftoverVisibleColumns,
			new Position(position.lineNumber, position.column),
			position.leftoverVisibleColumns,
			columnHint,
		);
	}

	public static up(config: CursorConfiguration, model: ICursorSimpleModel, lineNumber: number, column: number, leftoverVisibleColumns: number, columnHint: number | null, count: number, allowMoveOnFirstLine: boolean): CursorPosition {
		return this.vertical(config, model, lineNumber, column, leftoverVisibleColumns, columnHint, lineNumber - count, allowMoveOnFirstLine, PositionAffinity.LeftOfInjectedText);
	}

	public static moveUp(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean, linesCount: number): SingleCursorState {
		let lineNumber: number,
			column: number;

		if (cursor.hasSelection() && !inSelectionMode) {
			// If we are in selection mode, move up acts relative to the beginning of selection
			lineNumber = cursor.selection.startLineNumber;
			column = cursor.selection.startColumn;
		} else {
			lineNumber = cursor.position.lineNumber;
			column = cursor.position.column;
		}

		const r = MoveOperations.up(config, model, lineNumber, column, cursor.leftoverVisibleColumns, cursor.columnHint, linesCount, true);

		return cursor.move(inSelectionMode, r.lineNumber, r.column, r.leftoverVisibleColumns, r.columnHint);
	}

	public static translateUp(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState): SingleCursorState {
		const columnHint = cursor.columnHint;
		const selection = cursor.selection;

		const selectionStart = MoveOperations.up(config, model, selection.selectionStartLineNumber, selection.selectionStartColumn, cursor.selectionStartLeftoverVisibleColumns, columnHint, 1, false);
		const position = MoveOperations.up(config, model, selection.positionLineNumber, selection.positionColumn, cursor.leftoverVisibleColumns, columnHint, 1, false);

		return new SingleCursorState(
			new Range(selectionStart.lineNumber, selectionStart.column, selectionStart.lineNumber, selectionStart.column),
			SelectionStartKind.Simple,
			selectionStart.leftoverVisibleColumns,
			new Position(position.lineNumber, position.column),
			position.leftoverVisibleColumns,
			columnHint,
		);
	}

	private static _isBlankLine(model: ICursorSimpleModel, lineNumber: number): boolean {
		if (model.getLineFirstNonWhitespaceColumn(lineNumber) === 0) {
			// empty or contains only whitespace
			return true;
		}
		return false;
	}

	public static moveToPrevBlankLine(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean): SingleCursorState {
		let lineNumber = cursor.position.lineNumber;

		// If our current line is blank, move to the previous non-blank line
		while (lineNumber > 1 && this._isBlankLine(model, lineNumber)) {
			lineNumber--;
		}

		// Find the previous blank line
		while (lineNumber > 1 && !this._isBlankLine(model, lineNumber)) {
			lineNumber--;
		}

		return cursor.move(inSelectionMode, lineNumber, model.getLineMinColumn(lineNumber), 0, null);
	}

	public static moveToNextBlankLine(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean): SingleCursorState {
		const lineCount = model.getLineCount();
		let lineNumber = cursor.position.lineNumber;

		// If our current line is blank, move to the next non-blank line
		while (lineNumber < lineCount && this._isBlankLine(model, lineNumber)) {
			lineNumber++;
		}

		// Find the next blank line
		while (lineNumber < lineCount && !this._isBlankLine(model, lineNumber)) {
			lineNumber++;
		}

		return cursor.move(inSelectionMode, lineNumber, model.getLineMinColumn(lineNumber), 0, null);
	}

	public static moveToBeginningOfLine(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean): SingleCursorState {
		const lineNumber = cursor.position.lineNumber;
		const minColumn = model.getLineMinColumn(lineNumber);
		const firstNonBlankColumn = model.getLineFirstNonWhitespaceColumn(lineNumber) || minColumn;

		let column: number;

		const relevantColumnNumber = cursor.position.column;
		if (relevantColumnNumber === firstNonBlankColumn) {
			column = minColumn;
		} else {
			column = firstNonBlankColumn;
		}

		return cursor.move(inSelectionMode, lineNumber, column, 0, null);
	}

	public static moveToEndOfLine(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean, sticky: boolean): SingleCursorState {
		const lineNumber = cursor.position.lineNumber;
		const maxColumn = model.getLineMaxColumn(lineNumber);
		return cursor.move(inSelectionMode, lineNumber, maxColumn, sticky ? Constants.MAX_SAFE_SMALL_INTEGER - maxColumn : 0, null);
	}

	public static moveToBeginningOfBuffer(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean): SingleCursorState {
		return cursor.move(inSelectionMode, 1, 1, 0, null);
	}

	public static moveToEndOfBuffer(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean): SingleCursorState {
		const lastLineNumber = model.getLineCount();
		const lastColumn = model.getLineMaxColumn(lastLineNumber);

		return cursor.move(inSelectionMode, lastLineNumber, lastColumn, 0, null);
	}
}
