/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { Emitter } from 'vs/base/common/event';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IFooService } from 'vs/workbench/contrib/foo/common/foo';

//
// Workbench contributions
//

class AsyncFooWorkbenchContribution {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		// Types of the imported file are pulled in correctly
		import('vs/workbench/contrib/foo/common/fooWorkbenchContribution').then(e => {
			instantiationService.createInstance(e.FooContribution, { EmitterCtor: Emitter });
		});
	}
}

// TODO: Provide registerAsyncWorkbenchContribution convenience method
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(AsyncFooWorkbenchContribution, 'FooWorkbenchContribution', LifecyclePhase.Restored);

//
// Services
//

interface IFooServiceFetcher {
	_serviceBrand: undefined;
	service: Promise<IFooService>;
}

class FooServiceFetcher implements IFooServiceFetcher {
	_serviceBrand: undefined;
	private _service?: Promise<IFooService>;
	get service(): Promise<IFooService> {
		if (!this._service) {
			this._service = import('vs/workbench/contrib/foo/common/fooService').then(e => new e.FooService());
		}
		return this._service;
	}
}

export const IFooServiceFetcher = createDecorator<IFooServiceFetcher>('fooServiceFetcher');
registerSingleton(IFooServiceFetcher, FooServiceFetcher, true);

// Use the async service in a regular bundled contribution
class RegularWorkbenchContribution {
	constructor(
		@IFooServiceFetcher fooServiceFetcher: IFooServiceFetcher
	) {
		fooServiceFetcher.service.then(e => e.bar());
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(RegularWorkbenchContribution, 'RegularWorkbenchContribution', LifecyclePhase.Restored);