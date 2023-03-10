/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { OperatingSystem } from 'vs/base/common/platform';
import { ClipboardDataToCopy, IBrowser, ICompleteTextAreaWrapper, ITextAreaInputHost, TextAreaInput } from 'vs/editor/browser/controller/textAreaInput';
import { TextAreaState } from 'vs/editor/browser/controller/textAreaState';
import { Position } from 'vs/editor/common/core/position';
import { IRecorded, IRecordedEvent, IRecordedTextareaState } from 'vs/editor/test/browser/controller/imeRecordedTypes';

suite('TextAreaInput', () => {

	interface OutgoingType {
		type: 'type';
		text: string;
		replacePrevCharCnt: number;
		replaceNextCharCnt: number;
		positionDelta: number;
	}
	interface OutgoingCompositionStart {
		type: 'compositionStart';
		data: string;
	}
	interface OutgoingCompositionUpdate {
		type: 'compositionUpdate';
		data: string;
	}
	interface OutgoingCompositionEnd {
		type: 'compositionEnd';
	}
	type OutoingEvent = OutgoingType | OutgoingCompositionStart | OutgoingCompositionUpdate | OutgoingCompositionEnd;

	function yieldNow(): Promise<void> {
		return new Promise((resolve, reject) => {
			queueMicrotask(resolve);
		});
	}

	async function simulateInteraction(recorded: IRecorded): Promise<OutoingEvent[]> {
		const disposables = new DisposableStore();
		const host: ITextAreaInputHost = {
			getDataToCopy: function (): ClipboardDataToCopy {
				throw new Error('Function not implemented.');
			},
			getScreenReaderContent: function (): TextAreaState {
				return new TextAreaState('', 0, 0, null, undefined);
			},
			deduceModelPosition: function (viewAnchorPosition: Position, deltaOffset: number, lineFeedCnt: number): Position {
				throw new Error('Function not implemented.');
			}
		};
		const wrapper = disposables.add(new class extends Disposable implements ICompleteTextAreaWrapper {
			private _onKeyDown = this._register(new Emitter<KeyboardEvent>());
			readonly onKeyDown = this._onKeyDown.event;

			private _onKeyPress = this._register(new Emitter<KeyboardEvent>());
			readonly onKeyPress = this._onKeyPress.event;

			private _onKeyUp = this._register(new Emitter<KeyboardEvent>());
			readonly onKeyUp = this._onKeyUp.event;

			private _onCompositionStart = this._register(new Emitter<CompositionEvent>());
			readonly onCompositionStart = this._onCompositionStart.event;

			private _onCompositionUpdate = this._register(new Emitter<CompositionEvent>());
			readonly onCompositionUpdate = this._onCompositionUpdate.event;

			private _onCompositionEnd = this._register(new Emitter<CompositionEvent>());
			readonly onCompositionEnd = this._onCompositionEnd.event;

			private _onBeforeInput = this._register(new Emitter<InputEvent>());
			readonly onBeforeInput = this._onBeforeInput.event;

			private _onInput = this._register(new Emitter<InputEvent>());
			readonly onInput = this._onInput.event;

			readonly onCut = Event.None;
			readonly onCopy = Event.None;
			readonly onPaste = Event.None;
			readonly onFocus = Event.None;
			readonly onBlur = Event.None;
			readonly onSyntheticTap = Event.None;

			private _state: IRecordedTextareaState;
			private _currDispatchingEvent: IRecordedEvent | null;

			constructor() {
				super();
				this._state = {
					selectionDirection: 'none',
					selectionEnd: 0,
					selectionStart: 0,
					value: ''
				};
				this._currDispatchingEvent = null;
			}

			public _initialize(state: IRecordedTextareaState): void {
				this._state.value = state.value;
				this._state.selectionStart = state.selectionStart;
				this._state.selectionEnd = state.selectionEnd;
			}

			public _dispatchRecordedEvent(event: IRecordedEvent): void {
				this._currDispatchingEvent = event;
				this._state.value = event.state.value;
				this._state.selectionStart = event.state.selectionStart;
				this._state.selectionEnd = event.state.selectionEnd;
				this._state.selectionDirection = event.state.selectionDirection;

				if (event.type === 'keydown' || event.type === 'keypress' || event.type === 'keyup') {
					const mockEvent = <KeyboardEvent>{
						timeStamp: event.timeStamp,
						type: event.type,
						altKey: event.altKey,
						charCode: event.charCode,
						code: event.code,
						ctrlKey: event.ctrlKey,
						isComposing: event.isComposing,
						key: event.key,
						keyCode: event.keyCode,
						location: event.location,
						metaKey: event.metaKey,
						repeat: event.repeat,
						shiftKey: event.shiftKey,
						getModifierState: (keyArg: string) => false
					};
					if (event.type === 'keydown') {
						this._onKeyDown.fire(mockEvent);
					} else if (event.type === 'keypress') {
						this._onKeyPress.fire(mockEvent);
					} else {
						this._onKeyUp.fire(mockEvent);
					}
				} else if (event.type === 'compositionstart' || event.type === 'compositionupdate' || event.type === 'compositionend') {
					const mockEvent = <CompositionEvent>{
						timeStamp: event.timeStamp,
						type: event.type,
						data: event.data
					};
					if (event.type === 'compositionstart') {
						this._onCompositionStart.fire(mockEvent);
					} else if (event.type === 'compositionupdate') {
						this._onCompositionUpdate.fire(mockEvent);
					} else {
						this._onCompositionEnd.fire(mockEvent);
					}
				} else if (event.type === 'beforeinput' || event.type === 'input') {
					const mockEvent = <InputEvent>{
						timeStamp: event.timeStamp,
						type: event.type,
						data: event.data,
						inputType: event.inputType,
						isComposing: event.isComposing,
					};
					if (event.type === 'beforeinput') {
						this._onBeforeInput.fire(mockEvent);
					} else {
						this._onInput.fire(mockEvent);
					}
				} else {
					throw new Error(`Not Implemented`);
				}
				this._currDispatchingEvent = null;
			}

			getValue(): string {
				return this._state.value;
			}
			setValue(reason: string, value: string): void {
				if (this._currDispatchingEvent?.type === 'compositionstart') {
					assert.fail('should not change the state of the textarea in a compositionstart');
				}
				this._state.value = value;
			}
			getSelectionStart(): number {
				return this._state.selectionDirection === 'backward' ? this._state.selectionEnd : this._state.selectionStart;
			}
			getSelectionEnd(): number {
				return this._state.selectionDirection === 'backward' ? this._state.selectionStart : this._state.selectionEnd;
			}
			setSelectionRange(reason: string, selectionStart: number, selectionEnd: number): void {
				if (this._currDispatchingEvent?.type === 'compositionstart') {
					assert.fail('should not change the state of the textarea in a compositionstart');
				}
				this._state.selectionStart = selectionStart;
				this._state.selectionEnd = selectionEnd;
				this._state.selectionDirection = (selectionStart !== selectionEnd ? 'forward' : 'none');
			}

			public setIgnoreSelectionChangeTime(reason: string): void { }
			public getIgnoreSelectionChangeTime(): number { return Date.now(); }
			public resetSelectionChangeTime(): void { }

			public hasFocus(): boolean { return true; }
		});
		const input = disposables.add(new TextAreaInput(host, wrapper, recorded.env.OS, recorded.env.browser));

		wrapper._initialize(recorded.initial);
		input._initializeFromTest();

		const outgoingEvents: OutoingEvent[] = [];

		disposables.add(input.onType((e) => outgoingEvents.push({
			type: 'type',
			text: e.text,
			replacePrevCharCnt: e.replacePrevCharCnt,
			replaceNextCharCnt: e.replaceNextCharCnt,
			positionDelta: e.positionDelta,
		})));
		disposables.add(input.onCompositionStart((e) => outgoingEvents.push({
			type: 'compositionStart',
			data: e.data,
		})));
		disposables.add(input.onCompositionUpdate((e) => outgoingEvents.push({
			type: 'compositionUpdate',
			data: e.data,
		})));
		disposables.add(input.onCompositionEnd((e) => outgoingEvents.push({
			type: 'compositionEnd'
		})));

		for (const event of recorded.events) {
			wrapper._dispatchRecordedEvent(event);
			await yieldNow();
		}

		return outgoingEvents;
	}

	function interpretTypeEvents(OS: OperatingSystem, browser: IBrowser, initialState: IRecordedTextareaState, events: OutoingEvent[]): IRecordedTextareaState {
		let text = initialState.value;
		let selectionStart = initialState.selectionStart;
		let selectionEnd = initialState.selectionEnd;
		for (const event of events) {
			if (event.type === 'type') {
				text = (
					text.substring(0, selectionStart - event.replacePrevCharCnt)
					+ event.text
					+ text.substring(selectionEnd + event.replaceNextCharCnt)
				);
				selectionStart = selectionStart - event.replacePrevCharCnt + event.text.length;
				selectionEnd = selectionStart;

				if (event.positionDelta) {
					selectionStart += event.positionDelta;
					selectionEnd += event.positionDelta;
				}
			}
		}
		return {
			value: text,
			selectionStart: selectionStart,
			selectionEnd: selectionEnd,
			selectionDirection: (browser.isFirefox || OS === OperatingSystem.Windows || OS === OperatingSystem.Linux) ? 'forward' : 'none'
		};
	}

	test('macOS - Chrome - Korean using 2-Set Korean (1)', async () => {
		// macOS, 2-Set Korean, type 'dkrk' and click
		const recorded: IRecorded = {
			env: { OS: OperatingSystem.Macintosh, browser: { isAndroid: false, isFirefox: false, isChrome: true, isSafari: false } },
			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyD', ctrlKey: false, isComposing: false, key: '???', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 6.20, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'compositionstart', data: '' },
				{ timeStamp: 6.40, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 6.50, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 6.90, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 136.10, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyD', ctrlKey: false, isComposing: true, key: '???', keyCode: 68, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 288.10, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: '???', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 296.00, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 296.00, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 296.40, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 368.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: '???', keyCode: 75, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 536.10, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyR', ctrlKey: false, isComposing: true, key: '???', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 543.20, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 543.30, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 543.60, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 632.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyR', ctrlKey: false, isComposing: true, key: '???', keyCode: 82, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 783.90, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: '???', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 790.70, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 790.80, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 791.20, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 791.20, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionend', data: '???' },
				{ timeStamp: 791.30, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionstart', data: '' },
				{ timeStamp: 791.30, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 791.30, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 791.50, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 880.10, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: '???', keyCode: 75, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2209.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'compositionend', data: '???' }
			],
			final: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' },
		};

		const actualOutgoingEvents = await simulateInteraction(recorded);
		assert.deepStrictEqual(actualOutgoingEvents, [
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: '???', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' },
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: '???', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' }
		]);

		const actualResultingState = interpretTypeEvents(recorded.env.OS, recorded.env.browser, recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

	test('macOS - Chrome - Korean using 2-Set Korean (2)', async () => {
		// macOS, 2-Set Korean, type 'qud' and click
		// See https://github.com/microsoft/vscode/issues/134254
		const recorded: IRecorded = {
			env: { OS: OperatingSystem.Macintosh, browser: { isAndroid: false, isFirefox: false, isChrome: true, isSafari: false } },
			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyQ', ctrlKey: false, isComposing: false, key: '???', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 7.40, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'compositionstart', data: '' },
				{ timeStamp: 7.60, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 7.60, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 8.20, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 136.10, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyQ', ctrlKey: false, isComposing: true, key: '???', keyCode: 81, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 680.10, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyU', ctrlKey: false, isComposing: true, key: '???', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 687.20, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 687.40, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 688.80, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 768.10, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyU', ctrlKey: false, isComposing: true, key: '???', keyCode: 85, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1768.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyD', ctrlKey: false, isComposing: true, key: '???', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1775.00, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1775.10, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 1775.60, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1928.10, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyD', ctrlKey: false, isComposing: true, key: '???', keyCode: 68, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 6565.70, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionend', data: '???' }
			],
			final: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' },
		};

		const actualOutgoingEvents = await simulateInteraction(recorded);
		assert.deepStrictEqual(actualOutgoingEvents, [
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: '???', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' }
		]);

		const actualResultingState = interpretTypeEvents(recorded.env.OS, recorded.env.browser, recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

	test('macOS - Chrome - Japanese using Hiragana (Google)', async () => {
		// macOS, Hiragana (Google), type 'sennsei' and Enter
		const recorded: IRecorded = {
			env: { OS: OperatingSystem.Macintosh, browser: { isAndroid: false, isFirefox: false, isChrome: true, isSafari: false } },
			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: false, key: 's', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 8.50, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'compositionstart', data: '' },
				{ timeStamp: 8.70, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 8.70, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 9.30, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 111.70, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: true, key: 's', keyCode: 83, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 439.80, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: true, key: 'e', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 444.50, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 444.60, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 445.20, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 559.90, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: true, key: 'e', keyCode: 69, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1943.90, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'n', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1949.30, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: '??????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1949.40, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionupdate', data: '??????' },
				{ timeStamp: 1949.90, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'input', data: '??????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2039.90, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'n', keyCode: 78, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2207.80, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'n', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2215.70, state: { value: 'aa??????aa', selectionStart: 2, selectionEnd: 4, selectionDirection: 'none' }, type: 'beforeinput', data: '??????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2215.80, state: { value: 'aa??????aa', selectionStart: 2, selectionEnd: 4, selectionDirection: 'none' }, type: 'compositionupdate', data: '??????' },
				{ timeStamp: 2216.10, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'input', data: '??????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2311.90, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'n', keyCode: 78, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2551.90, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: true, key: 's', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2557.00, state: { value: 'aa??????aa', selectionStart: 2, selectionEnd: 4, selectionDirection: 'none' }, type: 'beforeinput', data: '?????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2557.00, state: { value: 'aa??????aa', selectionStart: 2, selectionEnd: 4, selectionDirection: 'none' }, type: 'compositionupdate', data: '?????????' },
				{ timeStamp: 2557.40, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'none' }, type: 'input', data: '?????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2671.70, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: true, key: 's', keyCode: 83, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2903.80, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: true, key: 'e', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2912.30, state: { value: 'aa?????????aa', selectionStart: 2, selectionEnd: 5, selectionDirection: 'none' }, type: 'beforeinput', data: '?????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2912.50, state: { value: 'aa?????????aa', selectionStart: 2, selectionEnd: 5, selectionDirection: 'none' }, type: 'compositionupdate', data: '?????????' },
				{ timeStamp: 2912.90, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'none' }, type: 'input', data: '?????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3023.90, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: true, key: 'e', keyCode: 69, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3519.90, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyI', ctrlKey: false, isComposing: true, key: 'i', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3537.10, state: { value: 'aa?????????aa', selectionStart: 2, selectionEnd: 5, selectionDirection: 'none' }, type: 'beforeinput', data: '????????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3537.10, state: { value: 'aa?????????aa', selectionStart: 2, selectionEnd: 5, selectionDirection: 'none' }, type: 'compositionupdate', data: '????????????' },
				{ timeStamp: 3537.60, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'none' }, type: 'input', data: '????????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3639.90, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyI', ctrlKey: false, isComposing: true, key: 'i', keyCode: 73, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 4887.80, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'Enter', ctrlKey: false, isComposing: true, key: 'Enter', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 4892.80, state: { value: 'aa????????????aa', selectionStart: 2, selectionEnd: 6, selectionDirection: 'none' }, type: 'beforeinput', data: '????????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 4892.90, state: { value: 'aa????????????aa', selectionStart: 2, selectionEnd: 6, selectionDirection: 'none' }, type: 'compositionupdate', data: '????????????' },
				{ timeStamp: 4893.00, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'none' }, type: 'input', data: '????????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 4893.00, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'none' }, type: 'compositionend', data: '????????????' },
				{ timeStamp: 4967.80, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'Enter', ctrlKey: false, isComposing: false, key: 'Enter', keyCode: 13, location: 0, metaKey: false, repeat: false, shiftKey: false }
			],
			final: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'none' },
		};

		const actualOutgoingEvents = await simulateInteraction(recorded);
		assert.deepStrictEqual(actualOutgoingEvents, [
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: '???', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '??????', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '??????' },
			{ type: 'type', text: '??????', replacePrevCharCnt: 2, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '??????' },
			{ type: 'type', text: '?????????', replacePrevCharCnt: 2, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '?????????' },
			{ type: 'type', text: '?????????', replacePrevCharCnt: 3, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '?????????' },
			{ type: 'type', text: '????????????', replacePrevCharCnt: 3, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '????????????' },
			{ type: 'type', text: '????????????', replacePrevCharCnt: 4, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '????????????' },
			{ type: 'type', text: '????????????', replacePrevCharCnt: 4, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' }
		]);

		const actualResultingState = interpretTypeEvents(recorded.env.OS, recorded.env.browser, recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

	test('macOS - Chrome - Chinese using Pinyin - Traditional', async () => {
		// macOS, Pinyin - Traditional, type 'xu' and '1'
		const recorded: IRecorded = {
			env: { OS: OperatingSystem.Macintosh, browser: { isAndroid: false, isFirefox: false, isChrome: true, isSafari: false } },
			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyX', ctrlKey: false, isComposing: false, key: 'x', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 48.70, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'compositionstart', data: '' },
				{ timeStamp: 48.80, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'beforeinput', data: 'x', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 48.90, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'compositionupdate', data: 'x' },
				{ timeStamp: 49.20, state: { value: 'aaxaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: 'x', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 127.80, state: { value: 'aaxaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyX', ctrlKey: false, isComposing: true, key: 'x', keyCode: 88, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 480.00, state: { value: 'aaxaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyU', ctrlKey: false, isComposing: true, key: 'u', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 535.60, state: { value: 'aaxaa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: 'xu', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 535.70, state: { value: 'aaxaa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionupdate', data: 'xu' },
				{ timeStamp: 535.90, state: { value: 'aaxuaa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'input', data: 'xu', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 575.80, state: { value: 'aaxuaa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyU', ctrlKey: false, isComposing: true, key: 'u', keyCode: 85, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1055.90, state: { value: 'aaxuaa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'Digit1', ctrlKey: false, isComposing: true, key: '1', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1061.70, state: { value: 'aaxuaa', selectionStart: 2, selectionEnd: 4, selectionDirection: 'none' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1061.80, state: { value: 'aaxuaa', selectionStart: 2, selectionEnd: 4, selectionDirection: 'none' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 1063.20, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1063.30, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionend', data: '???' },
				{ timeStamp: 1207.90, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'Digit1', ctrlKey: false, isComposing: false, key: '1', keyCode: 49, location: 0, metaKey: false, repeat: false, shiftKey: false }
			],
			final: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' },
		};

		const actualOutgoingEvents = await simulateInteraction(recorded);
		assert.deepStrictEqual(actualOutgoingEvents, [
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: 'x', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: 'x' },
			{ type: 'type', text: 'xu', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: 'xu' },
			{ type: 'type', text: '???', replacePrevCharCnt: 2, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' }
		]);

		const actualResultingState = interpretTypeEvents(recorded.env.OS, recorded.env.browser, recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

	test('macOS - Chrome - long press with arrow keys', async () => {
		// macOS, English, long press o, press arrow right twice and then press Enter
		// See https://github.com/microsoft/vscode/issues/67739
		const recorded: IRecorded = {
			env: { OS: OperatingSystem.Macintosh, browser: { isAndroid: false, isFirefox: false, isChrome: true, isSafari: false } },
			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyO', ctrlKey: false, isComposing: false, key: 'o', keyCode: 79, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'keypress', altKey: false, charCode: 111, code: 'KeyO', ctrlKey: false, isComposing: false, key: 'o', keyCode: 111, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2.80, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'beforeinput', data: 'o', inputType: 'insertText', isComposing: false },
				{ timeStamp: 3.40, state: { value: 'aaoaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: 'o', inputType: 'insertText', isComposing: false },
				{ timeStamp: 500.50, state: { value: 'aaoaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyO', ctrlKey: false, isComposing: false, key: 'o', keyCode: 79, location: 0, metaKey: false, repeat: true, shiftKey: false },
				{ timeStamp: 583.90, state: { value: 'aaoaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyO', ctrlKey: false, isComposing: false, key: 'o', keyCode: 79, location: 0, metaKey: false, repeat: true, shiftKey: false },
				{ timeStamp: 667.60, state: { value: 'aaoaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyO', ctrlKey: false, isComposing: false, key: 'o', keyCode: 79, location: 0, metaKey: false, repeat: true, shiftKey: false },
				{ timeStamp: 750.90, state: { value: 'aaoaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyO', ctrlKey: false, isComposing: false, key: 'o', keyCode: 79, location: 0, metaKey: false, repeat: true, shiftKey: false },
				{ timeStamp: 835.00, state: { value: 'aaoaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyO', ctrlKey: false, isComposing: false, key: 'o', keyCode: 79, location: 0, metaKey: false, repeat: true, shiftKey: false },
				{ timeStamp: 856.10, state: { value: 'aaoaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyO', ctrlKey: false, isComposing: false, key: 'o', keyCode: 79, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1952.10, state: { value: 'aaoaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'ArrowRight', ctrlKey: false, isComposing: false, key: 'ArrowRight', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1956.50, state: { value: 'aaoaa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionstart', data: 'o' },
				{ timeStamp: 1956.80, state: { value: 'aaoaa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: '??', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1956.90, state: { value: 'aaoaa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionupdate', data: '??' },
				{ timeStamp: 1960.60, state: { value: 'aa??aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: '??', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2088.10, state: { value: 'aa??aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'ArrowRight', ctrlKey: false, isComposing: true, key: 'ArrowRight', keyCode: 39, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2480.10, state: { value: 'aa??aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'ArrowRight', ctrlKey: false, isComposing: true, key: 'ArrowRight', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2484.30, state: { value: 'aa??aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: '??', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2484.40, state: { value: 'aa??aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionupdate', data: '??' },
				{ timeStamp: 2484.70, state: { value: 'aa??aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: '??', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2584.20, state: { value: 'aa??aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'ArrowRight', ctrlKey: false, isComposing: true, key: 'ArrowRight', keyCode: 39, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 6424.20, state: { value: 'aa??aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'Enter', ctrlKey: false, isComposing: true, key: 'Enter', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 6431.70, state: { value: 'aa??aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: '??', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 6431.70, state: { value: 'aa??aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionupdate', data: '??' },
				{ timeStamp: 6431.80, state: { value: 'aa??aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: '??', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 6431.90, state: { value: 'aa??aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionend', data: '??' },
				{ timeStamp: 6496.20, state: { value: 'aa??aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'Enter', ctrlKey: false, isComposing: false, key: 'Enter', keyCode: 13, location: 0, metaKey: false, repeat: false, shiftKey: false }
			],
			final: { value: 'aa??aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' },
		};

		const actualOutgoingEvents = await simulateInteraction(recorded);
		assert.deepStrictEqual(actualOutgoingEvents, [
			{ type: 'type', text: 'o', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionStart', data: 'o' },
			{ type: 'type', text: '??', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '??' },
			{ type: 'type', text: '??', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '??' },
			{ type: 'type', text: '??', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '??' },
			{ type: 'type', text: '??', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' }
		]);

		const actualResultingState = interpretTypeEvents(recorded.env.OS, recorded.env.browser, recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

	test('macOS - Chrome - pressing quotes on US Intl', async () => {
		// macOS, US International - PC, press ', ', ;
		const recorded: IRecorded = {
			env: { OS: OperatingSystem.Macintosh, browser: { isAndroid: false, isFirefox: false, isChrome: true, isSafari: false } },
			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'Quote', ctrlKey: false, isComposing: false, key: 'Dead', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2.80, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'compositionstart', data: '' },
				{ timeStamp: 3.10, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'beforeinput', data: '\'', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3.20, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'compositionupdate', data: '\'' },
				{ timeStamp: 3.70, state: { value: 'aa\'aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: '\'', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 71.90, state: { value: 'aa\'aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'Quote', ctrlKey: false, isComposing: true, key: 'Dead', keyCode: 222, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 144.00, state: { value: 'aa\'aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'Quote', ctrlKey: false, isComposing: true, key: 'Dead', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 146.20, state: { value: 'aa\'aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: '\'', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 146.40, state: { value: 'aa\'aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionupdate', data: '\'' },
				{ timeStamp: 146.70, state: { value: 'aa\'aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: '\'', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 146.80, state: { value: 'aa\'aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionend', data: '\'' },
				{ timeStamp: 147.20, state: { value: 'aa\'aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionstart', data: '' },
				{ timeStamp: 147.20, state: { value: 'aa\'aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: '\'', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 147.70, state: { value: 'aa\'aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionupdate', data: '\'' },
				{ timeStamp: 148.20, state: { value: 'aa\'\'aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'input', data: '\'', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 208.10, state: { value: 'aa\'\'aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'Quote', ctrlKey: false, isComposing: true, key: 'Dead', keyCode: 222, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 323.70, state: { value: 'aa\'\'aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'Semicolon', ctrlKey: false, isComposing: true, key: ';', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 325.70, state: { value: 'aa\'\'aa', selectionStart: 3, selectionEnd: 4, selectionDirection: 'none' }, type: 'beforeinput', data: '\';', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 325.80, state: { value: 'aa\'\'aa', selectionStart: 3, selectionEnd: 4, selectionDirection: 'none' }, type: 'compositionupdate', data: '\';' },
				{ timeStamp: 326.30, state: { value: 'aa\'\';aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'none' }, type: 'input', data: '\';', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 326.30, state: { value: 'aa\'\';aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'none' }, type: 'compositionend', data: '\';' },
				{ timeStamp: 428.00, state: { value: 'aa\'\';aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'Semicolon', ctrlKey: false, isComposing: false, key: ';', keyCode: 186, location: 0, metaKey: false, repeat: false, shiftKey: false }
			],
			final: { value: 'aa\'\';aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'none' },
		};

		const actualOutgoingEvents = await simulateInteraction(recorded);
		assert.deepStrictEqual(actualOutgoingEvents, ([
			{ type: "compositionStart", data: "" },
			{ type: "type", text: "'", replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: "compositionUpdate", data: "'" },
			{ type: "type", text: "'", replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: "compositionUpdate", data: "'" },
			{ type: "type", text: "'", replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: "compositionEnd" },
			{ type: "compositionStart", data: "" },
			{ type: "type", text: "'", replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: "compositionUpdate", data: "'" },
			{ type: "type", text: "';", replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: "compositionUpdate", data: "';" },
			{ type: "type", text: "';", replacePrevCharCnt: 2, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: "compositionEnd" }
		]));

		const actualResultingState = interpretTypeEvents(recorded.env.OS, recorded.env.browser, recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

	test('macOS - Chrome - inserting emoji using ctrl+cmd+space', async () => {
		// macOS, English, press ctrl+cmd+space, and then pick an emoji using the mouse
		// See https://github.com/microsoft/vscode/issues/4271
		const recorded: IRecorded = {
			env: { OS: OperatingSystem.Macintosh, browser: { isAndroid: false, isFirefox: false, isChrome: true, isSafari: false } },
			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'ControlLeft', ctrlKey: true, isComposing: false, key: 'Control', keyCode: 17, location: 1, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 600.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'MetaLeft', ctrlKey: true, isComposing: false, key: 'Meta', keyCode: 91, location: 1, metaKey: true, repeat: false, shiftKey: false },
				{ timeStamp: 1080.10, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'Space', ctrlKey: true, isComposing: false, key: ' ', keyCode: 32, location: 0, metaKey: true, repeat: false, shiftKey: false },
				{ timeStamp: 1247.90, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'MetaLeft', ctrlKey: true, isComposing: false, key: 'Meta', keyCode: 91, location: 1, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1263.80, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'Space', ctrlKey: true, isComposing: false, key: ' ', keyCode: 32, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1367.80, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'ControlLeft', ctrlKey: false, isComposing: false, key: 'Control', keyCode: 17, location: 1, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 17962.90, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'beforeinput', data: '????', inputType: 'insertText', isComposing: false },
				{ timeStamp: 17966.60, state: { value: 'aa????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'input', data: '????', inputType: 'insertText', isComposing: false }
			],
			final: { value: 'aa????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' },
		};

		const actualOutgoingEvents = await simulateInteraction(recorded);
		assert.deepStrictEqual(actualOutgoingEvents, ([
			{ type: 'type', text: '????', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 }
		]));

		const actualResultingState = interpretTypeEvents(recorded.env.OS, recorded.env.browser, recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

	test('macOS - Firefox - long press with mouse', async () => {
		// macOS, English, long press e and choose using mouse
		// See https://github.com/microsoft/monaco-editor/issues/2358
		const recorded: IRecorded = {
			env: { OS: OperatingSystem.Macintosh, browser: { isAndroid: false, isFirefox: true, isChrome: false, isSafari: false } },
			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: false, key: 'e', keyCode: 69, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'keypress', altKey: false, charCode: 101, code: 'KeyE', ctrlKey: false, isComposing: false, key: 'e', keyCode: 101, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 7.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'beforeinput', data: 'e', inputType: 'insertText', isComposing: false },
				{ timeStamp: 7.00, state: { value: 'aaeaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: 'e', inputType: 'insertText', isComposing: false },
				{ timeStamp: 500.00, state: { value: 'aaeaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: false, key: 'e', keyCode: 69, location: 0, metaKey: false, repeat: true, shiftKey: false },
				{ timeStamp: 667.00, state: { value: 'aaeaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: false, key: 'e', keyCode: 69, location: 0, metaKey: false, repeat: true, shiftKey: false },
				{ timeStamp: 750.00, state: { value: 'aaeaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: false, key: 'e', keyCode: 69, location: 0, metaKey: false, repeat: true, shiftKey: false },
				{ timeStamp: 834.00, state: { value: 'aaeaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: false, key: 'e', keyCode: 69, location: 0, metaKey: false, repeat: true, shiftKey: false },
				{ timeStamp: 917.00, state: { value: 'aaeaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: false, key: 'e', keyCode: 69, location: 0, metaKey: false, repeat: true, shiftKey: false },
				{ timeStamp: 1001.00, state: { value: 'aaeaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: false, key: 'e', keyCode: 69, location: 0, metaKey: false, repeat: true, shiftKey: false },
				{ timeStamp: 1024.00, state: { value: 'aaeaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: false, key: 'e', keyCode: 69, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2988.00, state: { value: 'aaeaa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '??', inputType: 'insertText', isComposing: false },
				{ timeStamp: 2988.00, state: { value: 'aa??aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '??', inputType: 'insertText', isComposing: false }
			],
			final: { value: 'aa??aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' },
		};

		const actualOutgoingEvents = await simulateInteraction(recorded);
		assert.deepStrictEqual(actualOutgoingEvents, [
			{ type: 'type', text: 'e', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'type', text: '??', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 }
		]);

		const actualResultingState = interpretTypeEvents(recorded.env.OS, recorded.env.browser, recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

	test('macOS - Firefox - inserting emojis', async () => {
		// macOS, English, from the edit menu, click Emoji & Symbols, select an emoji
		// See https://github.com/microsoft/vscode/issues/106392
		const recorded: IRecorded = {
			env: { OS: OperatingSystem.Macintosh, browser: { isAndroid: false, isFirefox: true, isChrome: false, isSafari: false } },
			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'beforeinput', data: '????', inputType: 'insertText', isComposing: false },
				{ timeStamp: 1.00, state: { value: 'aa????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: '????', inputType: 'insertText', isComposing: false }
			],
			final: { value: 'aa????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' },
		};

		const actualOutgoingEvents = await simulateInteraction(recorded);
		assert.deepStrictEqual(actualOutgoingEvents, [
			{ type: 'type', text: '????', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 }
		]);

		const actualResultingState = interpretTypeEvents(recorded.env.OS, recorded.env.browser, recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

	test('macOS - Safari - Chinese - issue #119469', async () => {
		const recorded: IRecorded = {
			env: { 'OS': OperatingSystem.Macintosh, 'browser': { 'isAndroid': false, 'isFirefox': false, 'isChrome': false, 'isSafari': true } },
			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'compositionstart', data: '' },
				{ timeStamp: 1.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'compositionupdate', data: 'f' },
				{ timeStamp: 1.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'beforeinput', data: 'f', inputType: 'insertCompositionText', isComposing: undefined },
				{ timeStamp: 2.00, state: { value: 'aafaa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: 'f', inputType: 'insertCompositionText', isComposing: undefined },
				{ timeStamp: -30.00, state: { value: 'aafaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyF', ctrlKey: false, isComposing: true, key: 'f', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 106.00, state: { value: 'aafaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyF', ctrlKey: false, isComposing: true, key: 'f', keyCode: 70, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 721.00, state: { value: 'aafaa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: null, inputType: 'deleteCompositionText', isComposing: undefined },
				{ timeStamp: 723.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'input', data: null, inputType: 'deleteCompositionText', isComposing: undefined },
				{ timeStamp: 723.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'beforeinput', data: 'f', inputType: 'insertFromComposition', isComposing: undefined },
				{ timeStamp: 723.00, state: { value: 'aafaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: 'f', inputType: 'insertFromComposition', isComposing: undefined },
				{ timeStamp: 723.00, state: { value: 'aafaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionend', data: 'f' },
				{ timeStamp: 698.00, state: { value: 'aafaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'Enter', ctrlKey: false, isComposing: false, key: 'Enter', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 826.00, state: { value: 'aafaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'Enter', ctrlKey: false, isComposing: false, key: 'Enter', keyCode: 13, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1114.00, state: { value: 'aafaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'Enter', ctrlKey: false, isComposing: false, key: 'Enter', keyCode: 13, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1114.00, state: { value: 'aafaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keypress', altKey: false, charCode: 13, code: 'Enter', ctrlKey: false, isComposing: false, key: 'Enter', keyCode: 13, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1137.00, state: { value: 'aafaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: null, inputType: 'insertLineBreak', isComposing: undefined },
				{ timeStamp: 1138.00, state: { value: 'aaf\naa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'input', data: null, inputType: 'insertLineBreak', isComposing: undefined },
				{ timeStamp: 1250.00, state: { value: 'aaf\naa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'Enter', ctrlKey: false, isComposing: false, key: 'Enter', keyCode: 13, location: 0, metaKey: false, repeat: false, shiftKey: false }
			],
			final: {
				value: 'aaf\naa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none'
			},
		};

		const actualOutgoingEvents = await simulateInteraction(recorded);
		assert.deepStrictEqual(actualOutgoingEvents, ([
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: 'f', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: 'f' },
			{ type: 'type', text: 'f', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' },
			{ type: 'type', text: '\n', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 }
		]));

		const actualResultingState = interpretTypeEvents(recorded.env.OS, recorded.env.browser, recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

	test('Windows - Chrome - Japanese using Hiragana', async () => {
		// Windows, Japanese/Hiragana, type 'sennsei' and Enter
		const recorded: IRecorded = {
			env: { OS: OperatingSystem.Windows, browser: { isAndroid: false, isFirefox: false, isChrome: true, isSafari: false } },
			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: false, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 0.80, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'compositionstart', data: '' },
				{ timeStamp: 0.80, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 0.90, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 9.30, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 97.50, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 99.10, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: true, key: 's', keyCode: 83, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 615.90, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 619.80, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 619.80, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 627.70, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 719.90, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 723.60, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: true, key: 'e', keyCode: 69, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1816.10, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1828.30, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '??????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1828.40, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '??????' },
				{ timeStamp: 1828.70, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: '??????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1903.70, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1904.70, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'n', keyCode: 78, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2111.70, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2123.40, state: { value: 'aa??????aa', selectionStart: 2, selectionEnd: 4, selectionDirection: 'forward' }, type: 'beforeinput', data: '??????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2123.40, state: { value: 'aa??????aa', selectionStart: 2, selectionEnd: 4, selectionDirection: 'forward' }, type: 'compositionupdate', data: '??????' },
				{ timeStamp: 2123.70, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: '??????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2215.80, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2217.10, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'n', keyCode: 78, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2968.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2970.00, state: { value: 'aa??????aa', selectionStart: 2, selectionEnd: 4, selectionDirection: 'forward' }, type: 'beforeinput', data: '?????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2970.00, state: { value: 'aa??????aa', selectionStart: 2, selectionEnd: 4, selectionDirection: 'forward' }, type: 'compositionupdate', data: '?????????' },
				{ timeStamp: 2970.20, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'input', data: '?????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3079.70, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3080.70, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: true, key: 's', keyCode: 83, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3295.20, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3297.10, state: { value: 'aa?????????aa', selectionStart: 2, selectionEnd: 5, selectionDirection: 'forward' }, type: 'beforeinput', data: '?????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3297.20, state: { value: 'aa?????????aa', selectionStart: 2, selectionEnd: 5, selectionDirection: 'forward' }, type: 'compositionupdate', data: '?????????' },
				{ timeStamp: 3297.40, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'input', data: '?????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3408.00, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3409.00, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: true, key: 'e', keyCode: 69, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3880.80, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyI', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3882.80, state: { value: 'aa?????????aa', selectionStart: 2, selectionEnd: 5, selectionDirection: 'forward' }, type: 'beforeinput', data: '????????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3882.90, state: { value: 'aa?????????aa', selectionStart: 2, selectionEnd: 5, selectionDirection: 'forward' }, type: 'compositionupdate', data: '????????????' },
				{ timeStamp: 3883.30, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'input', data: '????????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3976.30, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyI', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3977.50, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyI', ctrlKey: false, isComposing: true, key: 'i', keyCode: 73, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 6364.90, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'Enter', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 6367.40, state: { value: 'aa????????????aa', selectionStart: 2, selectionEnd: 6, selectionDirection: 'forward' }, type: 'beforeinput', data: '????????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 6367.40, state: { value: 'aa????????????aa', selectionStart: 2, selectionEnd: 6, selectionDirection: 'forward' }, type: 'compositionupdate', data: '????????????' },
				{ timeStamp: 6367.60, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'input', data: '????????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 6367.60, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'compositionend', data: '????????????' },
				{ timeStamp: 6479.60, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'Enter', ctrlKey: false, isComposing: false, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false }
			],
			final: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' },
		};

		const actualOutgoingEvents = await simulateInteraction(recorded);
		assert.deepStrictEqual(actualOutgoingEvents, [
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: '???', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '??????', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '??????' },
			{ type: 'type', text: '??????', replacePrevCharCnt: 2, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '??????' },
			{ type: 'type', text: '?????????', replacePrevCharCnt: 2, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '?????????' },
			{ type: 'type', text: '?????????', replacePrevCharCnt: 3, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '?????????' },
			{ type: 'type', text: '????????????', replacePrevCharCnt: 3, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '????????????' },
			{ type: 'type', text: '????????????', replacePrevCharCnt: 4, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '????????????' },
			{ type: 'type', text: '????????????', replacePrevCharCnt: 4, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' }
		]);

		const actualResultingState = interpretTypeEvents(recorded.env.OS, recorded.env.browser, recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

	test('Windows 11 - Chrome - Japanese using Hiragana', async () => {
		// Windows, Japanese/Hiragana, type 'sennsei' and Enter
		const recorded: IRecorded = {
			env: { OS: OperatingSystem.Windows, browser: { isAndroid: false, isFirefox: false, isChrome: true, isSafari: false } },
			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: false, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 15.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'compositionstart', data: '' },
				{ timeStamp: 15.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 15.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 20.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 111.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 111.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: true, key: 's', keyCode: 83, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 832.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 839.00, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 839.00, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 890.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 936.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 937.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: true, key: 'e', keyCode: 69, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1456.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1460.00, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '??????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1460.00, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '??????' },
				{ timeStamp: 1461.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: '??????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1522.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1522.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'n', keyCode: 78, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1684.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1694.00, state: { value: 'aa??????aa', selectionStart: 2, selectionEnd: 4, selectionDirection: 'forward' }, type: 'beforeinput', data: '??????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1694.00, state: { value: 'aa??????aa', selectionStart: 2, selectionEnd: 4, selectionDirection: 'forward' }, type: 'compositionupdate', data: '??????' },
				{ timeStamp: 1694.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: '??????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1763.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1763.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'n', keyCode: 78, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1873.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1878.00, state: { value: 'aa??????aa', selectionStart: 2, selectionEnd: 4, selectionDirection: 'forward' }, type: 'beforeinput', data: '?????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1878.00, state: { value: 'aa??????aa', selectionStart: 2, selectionEnd: 4, selectionDirection: 'forward' }, type: 'compositionupdate', data: '?????????' },
				{ timeStamp: 1878.00, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'input', data: '?????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1969.00, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1969.00, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: true, key: 's', keyCode: 83, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2094.00, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2111.00, state: { value: 'aa?????????aa', selectionStart: 2, selectionEnd: 5, selectionDirection: 'forward' }, type: 'beforeinput', data: '?????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2111.00, state: { value: 'aa?????????aa', selectionStart: 2, selectionEnd: 5, selectionDirection: 'forward' }, type: 'compositionupdate', data: '?????????' },
				{ timeStamp: 2111.00, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'input', data: '?????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2222.00, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2222.00, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyE', ctrlKey: false, isComposing: true, key: 'e', keyCode: 69, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2356.00, state: { value: 'aa?????????aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyI', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2367.00, state: { value: 'aa?????????aa', selectionStart: 2, selectionEnd: 5, selectionDirection: 'forward' }, type: 'beforeinput', data: '????????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2367.00, state: { value: 'aa?????????aa', selectionStart: 2, selectionEnd: 5, selectionDirection: 'forward' }, type: 'compositionupdate', data: '????????????' },
				{ timeStamp: 2367.00, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'input', data: '????????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2456.00, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyI', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2456.00, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyI', ctrlKey: false, isComposing: true, key: 'i', keyCode: 73, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3776.00, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'Enter', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3776.00, state: { value: 'aa????????????aa', selectionStart: 2, selectionEnd: 6, selectionDirection: 'forward' }, type: 'beforeinput', data: '????????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3776.00, state: { value: 'aa????????????aa', selectionStart: 2, selectionEnd: 6, selectionDirection: 'forward' }, type: 'compositionupdate', data: '????????????' },
				{ timeStamp: 3785.00, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'input', data: '????????????', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3785.00, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'compositionend', data: '????????????' },
				{ timeStamp: 3886.00, state: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'Enter', ctrlKey: false, isComposing: false, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false }
			],
			final: { value: 'aa????????????aa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' },
		};

		const actualOutgoingEvents = await simulateInteraction(recorded);
		assert.deepStrictEqual(actualOutgoingEvents, ([
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: '???', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '??????', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '??????' },
			{ type: 'type', text: '??????', replacePrevCharCnt: 2, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '??????' },
			{ type: 'type', text: '?????????', replacePrevCharCnt: 2, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '?????????' },
			{ type: 'type', text: '?????????', replacePrevCharCnt: 3, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '?????????' },
			{ type: 'type', text: '????????????', replacePrevCharCnt: 3, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '????????????' },
			{ type: 'type', text: '????????????', replacePrevCharCnt: 4, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '????????????' },
			{ type: 'type', text: '????????????', replacePrevCharCnt: 4, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' }
		]));

		const actualResultingState = interpretTypeEvents(recorded.env.OS, recorded.env.browser, recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

	test('Windows - Chrome - Korean (1)', async () => {
		// Windows, Korean, type 'dkrk' and click
		const recorded: IRecorded = {
			env: { OS: OperatingSystem.Windows, browser: { isAndroid: false, isFirefox: false, isChrome: true, isSafari: false } },
			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyD', ctrlKey: false, isComposing: false, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 23.10, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'compositionstart', data: '' },
				{ timeStamp: 23.10, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 23.20, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 23.60, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 119.30, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyD', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 215.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 215.40, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 215.40, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 215.90, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 303.20, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 511.10, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyR', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 511.70, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 511.70, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 512.10, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 598.20, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyR', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 791.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 791.50, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 791.50, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 791.80, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 791.90, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionend', data: '???' },
				{ timeStamp: 792.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionstart', data: '' },
				{ timeStamp: 792.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 792.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 792.30, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 919.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2721.50, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'compositionend', data: '???' }
			],
			final: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' },
		};

		const actualOutgoingEvents = await simulateInteraction(recorded);
		assert.deepStrictEqual(actualOutgoingEvents, [
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: '???', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' },
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: '???', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' }
		]);

		const actualResultingState = interpretTypeEvents(recorded.env.OS, recorded.env.browser, recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

	test('Windows 11 - Chrome - Korean (1)', async () => {
		// Windows, Korean, type 'dkrk' and Space
		const recorded: IRecorded = {
			env: { OS: OperatingSystem.Windows, browser: { isAndroid: false, isFirefox: false, isChrome: true, isSafari: false } },

			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyD', ctrlKey: false, isComposing: false, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 9.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'compositionstart', data: '' },
				{ timeStamp: 10.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 10.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 26.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 119.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyD', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 134.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyD', ctrlKey: false, isComposing: true, key: 'd', keyCode: 68, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 442.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 442.00, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 442.00, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 451.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 535.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 535.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'k', keyCode: 75, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 879.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyR', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 879.00, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 879.00, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 881.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 980.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyR', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 992.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyR', ctrlKey: false, isComposing: true, key: 'r', keyCode: 82, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1230.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1230.00, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1230.00, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 1242.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1242.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionend', data: '???' },
				{ timeStamp: 1242.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionstart', data: '' },
				{ timeStamp: 1242.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1242.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 1243.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1375.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1375.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'k', keyCode: 75, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3412.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'compositionend', data: '???' },
				{ timeStamp: 3412.00, state: { value: 'aa??????aa', selectionStart: 3, selectionEnd: 4, selectionDirection: 'forward' }, type: 'beforeinput', data: null, inputType: 'deleteContentBackward', isComposing: false },
				{ timeStamp: 3413.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: null, inputType: 'deleteContentBackward', isComposing: false },
				{ timeStamp: 3413.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertText', isComposing: false },
				{ timeStamp: 3414.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertText', isComposing: false }
			],
			final: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' },
		};

		const actualOutgoingEvents = await simulateInteraction(recorded);
		assert.deepStrictEqual(actualOutgoingEvents, [
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: '???', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' },
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: '???', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' },
			{ type: 'type', text: '', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'type', text: '???', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 }
		]);

		const actualResultingState = interpretTypeEvents(recorded.env.OS, recorded.env.browser, recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

	test('Windows - Chrome - Korean (2)', async () => {
		// Windows, Korean, type 'gksrmf' and Space
		const recorded: IRecorded = {
			env: { OS: OperatingSystem.Windows, browser: { isAndroid: false, isFirefox: false, isChrome: true, isSafari: false } },
			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyG', ctrlKey: false, isComposing: false, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 23.30, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'compositionstart', data: '' },
				{ timeStamp: 23.50, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 23.50, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 27.30, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 111.80, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyG', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 606.80, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 607.40, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 607.40, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 607.80, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 705.20, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1455.80, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1456.40, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1456.50, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 1456.90, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1567.40, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1963.10, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyR', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1963.70, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1963.80, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 1963.80, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1963.90, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionend', data: '???' },
				{ timeStamp: 1964.10, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionstart', data: '' },
				{ timeStamp: 1964.10, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1964.10, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 1964.40, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2063.60, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyR', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2823.60, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyM', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2824.00, state: { value: 'aa??????aa', selectionStart: 3, selectionEnd: 4, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2824.10, state: { value: 'aa??????aa', selectionStart: 3, selectionEnd: 4, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 2824.40, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2935.30, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyM', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3187.50, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyF', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3188.00, state: { value: 'aa??????aa', selectionStart: 3, selectionEnd: 4, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3188.00, state: { value: 'aa??????aa', selectionStart: 3, selectionEnd: 4, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 3188.40, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3319.20, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyF', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3847.30, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'Space', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3847.80, state: { value: 'aa??????aa', selectionStart: 3, selectionEnd: 4, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3847.80, state: { value: 'aa??????aa', selectionStart: 3, selectionEnd: 4, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 3847.90, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3848.10, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'compositionend', data: '???' },
				{ timeStamp: 3847.70, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'Space', ctrlKey: false, isComposing: false, key: ' ', keyCode: 32, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3847.80, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keypress', altKey: false, charCode: 32, code: 'Space', ctrlKey: false, isComposing: false, key: ' ', keyCode: 32, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3848.30, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'beforeinput', data: ' ', inputType: 'insertText', isComposing: false },
				{ timeStamp: 3848.60, state: { value: 'aa?????? aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'input', data: ' ', inputType: 'insertText', isComposing: false },
				{ timeStamp: 3919.20, state: { value: 'aa?????? aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'Space', ctrlKey: false, isComposing: false, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3919.50, state: { value: 'aa?????? aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'Space', ctrlKey: false, isComposing: false, key: ' ', keyCode: 32, location: 0, metaKey: false, repeat: false, shiftKey: false }
			],
			final: { value: 'aa?????? aa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' },
		};

		const actualOutgoingEvents = await simulateInteraction(recorded);
		assert.deepStrictEqual(actualOutgoingEvents, [
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: '???', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' },
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: '???', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' },
			{ type: 'type', text: ' ', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 }
		]);

		const actualResultingState = interpretTypeEvents(recorded.env.OS, recorded.env.browser, recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

	test('Windows 11 - Chrome - Korean (2)', async () => {
		// Windows, Korean, type 'gksrmf' and Space
		const recorded: IRecorded = {
			env: { OS: OperatingSystem.Windows, browser: { isAndroid: false, isFirefox: false, isChrome: true, isSafari: false } },
			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'ControlLeft', ctrlKey: false, isComposing: false, key: 'Control', keyCode: 17, location: 1, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1561.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyG', ctrlKey: false, isComposing: false, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1566.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'compositionstart', data: '' },
				{ timeStamp: 1566.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1566.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 1567.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1681.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyG', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1681.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyG', ctrlKey: false, isComposing: true, key: 'g', keyCode: 71, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2013.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2013.00, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2013.00, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 2013.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2096.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2096.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'k', keyCode: 75, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2457.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2457.00, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2457.00, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 2457.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2568.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2568.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyS', ctrlKey: false, isComposing: true, key: 's', keyCode: 83, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3066.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyR', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3066.00, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3066.00, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 3066.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3066.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionend', data: '???' },
				{ timeStamp: 3070.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionstart', data: '' },
				{ timeStamp: 3070.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3070.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 3071.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3180.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyR', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3180.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyR', ctrlKey: false, isComposing: true, key: 'r', keyCode: 82, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3650.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyM', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3650.00, state: { value: 'aa??????aa', selectionStart: 3, selectionEnd: 4, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3650.00, state: { value: 'aa??????aa', selectionStart: 3, selectionEnd: 4, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 3650.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3753.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyM', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3768.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyM', ctrlKey: false, isComposing: true, key: 'm', keyCode: 77, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 4554.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyF', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 4554.00, state: { value: 'aa??????aa', selectionStart: 3, selectionEnd: 4, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 4554.00, state: { value: 'aa??????aa', selectionStart: 3, selectionEnd: 4, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 4558.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 4685.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyF', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 4685.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyF', ctrlKey: false, isComposing: true, key: 'f', keyCode: 70, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 6632.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'compositionend', data: '???' },
				{ timeStamp: 6634.00, state: { value: 'aa??????aa', selectionStart: 3, selectionEnd: 4, selectionDirection: 'forward' }, type: 'beforeinput', data: null, inputType: 'deleteContentBackward', isComposing: false },
				{ timeStamp: 6634.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: null, inputType: 'deleteContentBackward', isComposing: false },
				{ timeStamp: 6634.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertText', isComposing: false },
				{ timeStamp: 6634.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertText', isComposing: false }
			],
			final: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' },

		};

		const actualOutgoingEvents = await simulateInteraction(recorded);
		assert.deepStrictEqual(actualOutgoingEvents, [
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: '???', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' },
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: '???', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' },
			{ type: 'type', text: '', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'type', text: '???', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 }
		]);

		const actualResultingState = interpretTypeEvents(recorded.env.OS, recorded.env.browser, recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

	test('Windows - Chrome - Chinese', async () => {
		// Windows, Chinese, Type 'ni' press Space and then 'hao' and press Space.
		const recorded: IRecorded = {
			env: { OS: OperatingSystem.Windows, browser: { isAndroid: false, isFirefox: false, isChrome: true, isSafari: false } },
			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: false, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 0.80, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'compositionstart', data: '' },
				{ timeStamp: 0.90, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'beforeinput', data: 'n', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'compositionupdate', data: 'n' },
				{ timeStamp: 1.20, state: { value: 'aanaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: 'n', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 66.80, state: { value: 'aanaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 67.90, state: { value: 'aanaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'n', keyCode: 78, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 466.70, state: { value: 'aanaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyI', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 470.10, state: { value: 'aanaa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: 'ni', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 470.20, state: { value: 'aanaa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: 'ni' },
				{ timeStamp: 470.50, state: { value: 'aaniaa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: 'ni', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 563.20, state: { value: 'aaniaa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyI', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 564.20, state: { value: 'aaniaa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyI', ctrlKey: false, isComposing: true, key: 'i', keyCode: 73, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1835.00, state: { value: 'aaniaa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'Space', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1837.20, state: { value: 'aaniaa', selectionStart: 2, selectionEnd: 4, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1837.30, state: { value: 'aaniaa', selectionStart: 2, selectionEnd: 4, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 1837.70, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1837.80, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionend', data: '???' },
				{ timeStamp: 1914.90, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'Space', ctrlKey: false, isComposing: false, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1916.10, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'Space', ctrlKey: false, isComposing: false, key: ' ', keyCode: 32, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3000.40, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyH', ctrlKey: false, isComposing: false, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3000.80, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionstart', data: '' },
				{ timeStamp: 3000.80, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: 'h', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3000.90, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: 'h' },
				{ timeStamp: 3001.30, state: { value: 'aa???haa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: 'h', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3091.60, state: { value: 'aa???haa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyH', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3092.60, state: { value: 'aa???haa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyH', ctrlKey: false, isComposing: true, key: 'h', keyCode: 72, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3131.50, state: { value: 'aa???haa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyA', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3134.80, state: { value: 'aa???haa', selectionStart: 3, selectionEnd: 4, selectionDirection: 'forward' }, type: 'beforeinput', data: 'ha', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3134.80, state: { value: 'aa???haa', selectionStart: 3, selectionEnd: 4, selectionDirection: 'forward' }, type: 'compositionupdate', data: 'ha' },
				{ timeStamp: 3135.10, state: { value: 'aa???haaa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'input', data: 'ha', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3234.90, state: { value: 'aa???haaa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyA', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3236.20, state: { value: 'aa???haaa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyA', ctrlKey: false, isComposing: true, key: 'a', keyCode: 65, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3491.70, state: { value: 'aa???haaa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyO', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3494.80, state: { value: 'aa???haaa', selectionStart: 3, selectionEnd: 5, selectionDirection: 'forward' }, type: 'beforeinput', data: 'hao', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3495.00, state: { value: 'aa???haaa', selectionStart: 3, selectionEnd: 5, selectionDirection: 'forward' }, type: 'compositionupdate', data: 'hao' },
				{ timeStamp: 3495.40, state: { value: 'aa???haoaa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'input', data: 'hao', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 3570.70, state: { value: 'aa???haoaa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyO', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 3572.40, state: { value: 'aa???haoaa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyO', ctrlKey: false, isComposing: true, key: 'o', keyCode: 79, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 4739.00, state: { value: 'aa???haoaa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'Space', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 4742.10, state: { value: 'aa???haoaa', selectionStart: 3, selectionEnd: 6, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 4742.10, state: { value: 'aa???haoaa', selectionStart: 3, selectionEnd: 6, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 4742.50, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 4742.60, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'compositionend', data: '???' },
				{ timeStamp: 4834.70, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'Space', ctrlKey: false, isComposing: false, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 4836.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'Space', ctrlKey: false, isComposing: false, key: ' ', keyCode: 32, location: 0, metaKey: false, repeat: false, shiftKey: false }
			],
			final: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' },
		};

		const actualOutgoingEvents = await simulateInteraction(recorded);
		assert.deepStrictEqual(actualOutgoingEvents, [
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: 'n', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: 'n' },
			{ type: 'type', text: 'ni', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: 'ni' },
			{ type: 'type', text: '???', replacePrevCharCnt: 2, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' },
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: 'h', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: 'h' },
			{ type: 'type', text: 'ha', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: 'ha' },
			{ type: 'type', text: 'hao', replacePrevCharCnt: 2, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: 'hao' },
			{ type: 'type', text: '???', replacePrevCharCnt: 3, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' }
		]);

		const actualResultingState = interpretTypeEvents(recorded.env.OS, recorded.env.browser, recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

	test('Windows 11 - Chrome - Chinese', async () => {
		// Windows, Chinese, Type 'ni' press Space and then 'hao' and press Space.
		const recorded: IRecorded = {
			env: { OS: OperatingSystem.Windows, browser: { isAndroid: false, isFirefox: false, isChrome: true, isSafari: false } },
			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: false, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'compositionstart', data: '' },
				{ timeStamp: 1.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'beforeinput', data: 'n', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'compositionupdate', data: 'n' },
				{ timeStamp: 1.00, state: { value: 'aanaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: 'n', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 63.00, state: { value: 'aanaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 63.00, state: { value: 'aanaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyN', ctrlKey: false, isComposing: true, key: 'n', keyCode: 78, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 331.00, state: { value: 'aanaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyI', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 331.00, state: { value: 'aanaa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: 'ni', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 331.00, state: { value: 'aanaa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: 'ni' },
				{ timeStamp: 342.00, state: { value: 'aaniaa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: 'ni', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 403.00, state: { value: 'aaniaa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyI', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 403.00, state: { value: 'aaniaa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyI', ctrlKey: false, isComposing: true, key: 'i', keyCode: 73, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 614.00, state: { value: 'aaniaa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'Space', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 617.00, state: { value: 'aaniaa', selectionStart: 2, selectionEnd: 4, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 617.00, state: { value: 'aaniaa', selectionStart: 2, selectionEnd: 4, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 657.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 658.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionend', data: '???' },
				{ timeStamp: 715.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'Space', ctrlKey: false, isComposing: false, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 715.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'Space', ctrlKey: false, isComposing: false, key: ' ', keyCode: 32, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1117.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyH', ctrlKey: false, isComposing: false, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1117.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionstart', data: '' },
				{ timeStamp: 1117.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: 'h', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1117.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: 'h' },
				{ timeStamp: 1117.00, state: { value: 'aa???haa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: 'h', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1199.00, state: { value: 'aa???haa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyH', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1199.00, state: { value: 'aa???haa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyH', ctrlKey: false, isComposing: true, key: 'h', keyCode: 72, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1317.00, state: { value: 'aa???haa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyA', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1322.00, state: { value: 'aa???haa', selectionStart: 3, selectionEnd: 4, selectionDirection: 'forward' }, type: 'beforeinput', data: 'ha', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1322.00, state: { value: 'aa???haa', selectionStart: 3, selectionEnd: 4, selectionDirection: 'forward' }, type: 'compositionupdate', data: 'ha' },
				{ timeStamp: 1328.00, state: { value: 'aa???haaa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'input', data: 'ha', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1419.00, state: { value: 'aa???haaa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyA', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1419.00, state: { value: 'aa???haaa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyA', ctrlKey: false, isComposing: true, key: 'a', keyCode: 65, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1592.00, state: { value: 'aa???haaa', selectionStart: 5, selectionEnd: 5, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyO', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1592.00, state: { value: 'aa???haaa', selectionStart: 3, selectionEnd: 5, selectionDirection: 'forward' }, type: 'beforeinput', data: 'hao', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1592.00, state: { value: 'aa???haaa', selectionStart: 3, selectionEnd: 5, selectionDirection: 'forward' }, type: 'compositionupdate', data: 'hao' },
				{ timeStamp: 1606.00, state: { value: 'aa???haoaa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'input', data: 'hao', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1666.00, state: { value: 'aa???haoaa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyO', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1681.00, state: { value: 'aa???haoaa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyO', ctrlKey: false, isComposing: true, key: 'o', keyCode: 79, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2187.00, state: { value: 'aa???haoaa', selectionStart: 6, selectionEnd: 6, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: 'Space', ctrlKey: false, isComposing: true, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2187.00, state: { value: 'aa???haoaa', selectionStart: 3, selectionEnd: 6, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2187.00, state: { value: 'aa???haoaa', selectionStart: 3, selectionEnd: 6, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 2199.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 2199.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'compositionend', data: '???' },
				{ timeStamp: 2315.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'Space', ctrlKey: false, isComposing: false, key: 'Process', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2323.00, state: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'Space', ctrlKey: false, isComposing: false, key: ' ', keyCode: 32, location: 0, metaKey: false, repeat: false, shiftKey: false }
			],
			final: { value: 'aa??????aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'forward' },
		};

		const actualOutgoingEvents = await simulateInteraction(recorded);
		assert.deepStrictEqual(actualOutgoingEvents, [
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: 'n', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: 'n' },
			{ type: 'type', text: 'ni', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: 'ni' },
			{ type: 'type', text: '???', replacePrevCharCnt: 2, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' },
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: 'h', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: 'h' },
			{ type: 'type', text: 'ha', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: 'ha' },
			{ type: 'type', text: 'hao', replacePrevCharCnt: 2, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: 'hao' },
			{ type: 'type', text: '???', replacePrevCharCnt: 3, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' }
		]);

		const actualResultingState = interpretTypeEvents(recorded.env.OS, recorded.env.browser, recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

	test('Linux - Chrome - Korean', async () => {
		// Linux, fcitx Hangul, Type 'rkr' and then click.
		const recorded: IRecorded = {
			env: { OS: OperatingSystem.Linux, browser: { isAndroid: false, isFirefox: false, isChrome: true, isSafari: false } },
			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: '', ctrlKey: false, isComposing: false, key: 'Unidentified', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1.20, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'compositionstart', data: '' },
				{ timeStamp: 1.30, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 1.40, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 1.70, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 104.50, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyR', ctrlKey: false, isComposing: true, key: 'r', keyCode: 82, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 150.60, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: '', ctrlKey: false, isComposing: true, key: 'Unidentified', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 151.30, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 151.40, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 151.80, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 248.50, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'k', keyCode: 75, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 322.90, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keydown', altKey: false, charCode: 0, code: '', ctrlKey: false, isComposing: true, key: 'Unidentified', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 323.70, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'beforeinput', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 323.90, state: { value: 'aa???aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionupdate', data: '???' },
				{ timeStamp: 324.10, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'input', data: '???', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 448.50, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyR', ctrlKey: false, isComposing: true, key: 'r', keyCode: 82, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 1761.00, state: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' }, type: 'compositionend', data: '???' }
			],
			final: { value: 'aa???aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'forward' },
		};

		const actualOutgoingEvents = await simulateInteraction(recorded);
		assert.deepStrictEqual(actualOutgoingEvents, [
			{ type: 'compositionStart', data: '' },
			{ type: 'type', text: '???', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '???' },
			{ type: 'type', text: '???', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' }
		]);

		const actualResultingState = interpretTypeEvents(recorded.env.OS, recorded.env.browser, recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

});
