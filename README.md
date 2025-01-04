# CustomJS

CustomJS is a plugin for Obsidian that allows users to write custom Javascript that you can call anywhere you can write JS — including `dataviewjs` blocks and templater templates.

✅ Works on desktop and mobile!

## Installation

#### Recommended

CustomJS is available in the Obsidian community plugin browser.

#### Manual

Go to the [releases](https://github.com/samlewis0602/obsidian-custom-js/releases) and download the latest `main.js` and `manifest.json` files. Create a folder called `customjs` inside `.obsidian/plugins` and place both files in it.

## Settings

Tell CustomJS what code to load.
NOTE: only use forward slashes in your paths, back slashes will break non-windows platforms.

### Individual files

A comma-separated list of files you'd like to load.

### Folder

Path to a folder that contains JS files you'd like to load. The folder setting will load all `*.js` files in that folder **recursively**. So setting `scripts` will load `scripts/a.js` and `scripts/other/b.js`.

> ⚠️ Files are loaded in alphabetical order by **_file name_** for consistency, enabling dependencies on each other.

### Registered invocable scripts

Allows you to bind an [Invocable Script](#invocable-scripts) to a hotkey.

### Startup scripts

[Invocable Scripts](#invocable-scripts) executed when the plugin is loaded. You may want use it to initialize something when Obsidian is loaded.

> ⚠️ Changes made in the `Startup scripts` to the `window.customJS` object might get overridden. To avoid that follow [State](#state) tips.

## Usage/Example

CustomJS works by writing javascript classes. Each file can contain one class _and only one class_. Imports, constants, etc defined outside the class will break CustomJS.

### Accessing your classes

**Global Object: `customJS`**
During startup, an instance of the custom classes is made available in the global `window.customJS` object.

Generally, the global object can be safely used in any kind of template, as those are invoked by user action after Obsidian loaded.

**Async Function: `await cJS()`**
Since the global object is initialized [asynchronously](#asynchronous-usage), you might need to use the loader function `cJS()` to ensure all classes are fully loaded before accessing your custom functions.

The async function is the official way of accessing your custom classes and should be used in code blocks of your notes. This ensures, that notes that are automatically opened when Obsidian starts up, do not throw an JS error

### Sample

````
// in vault at scripts/coolString.js
class CoolString {
    coolify(s) {
        return `😎 ${s} 😎`
    }
}


// dataviewjs block in *.md
```dataviewjs
const {CoolString} = await cJS()
dv.list(dv.pages().file.name.map(n => CoolString.coolify(n)))
```

// templater template
<%*
const {CoolString} = await cJS();
tR += CoolString.coolify(tp.file.title);
%>
````

Make sure you add `scripts/coolString.js` to the settings page for CustomJS and voila! When entering preview mode for the dataviewjs block you should see a list of all your files with a little extra 😎 — inserting the templater template will output a similar result with just the current file name.

> ⚠️ CustomJS will initialize any class as a singleton instance. If you want to create an isolated instance use `create${className}Instance` instead, such as `createCoolStringInstance` for the above class.

---

## Advanced Docs

### Global object

The `window.customJS` object holds instances to all your custom JS classes, as well as some special properties:

- `customJS.state: object` .. The customJS [state](#state) object
- `customJS.obsidian: Module` .. Internal [Obsidian API](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts) functions
- `customJS.app: App` .. Obsidian's [`class App`](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts) instance (same as `window.app`)

Every custom class you add creates two new properties:
- `customJS.MyModule: object` .. holds an instance to the `class MyModule {}` class
- `customJS.createMyModuleInstance: Function` .. A method that returns a _new_ instance to `MyModule`. Note that you cannot pass any argument to the constructor

### Asynchronous Usage

CustomJS loads your modules at Obsidian's startup by hooking an event that says that Obsidian is ready. This is an event that is used by _other_ plugins as well (such as [Templater](https://github.com/SilentVoid13/Templater) and its startup template, or [JS Engine](https://github.com/mProjectsCode/obsidian-js-engine-plugin)), and unfortunately this means that if you want to use CustomJS with them there can be problems.

> `customJS` is not defined

If you see issues where the `customJS` variable is not defined, this is when you want to force it to load before your script continues. In order to allow this, we provide the asynchronous function `cJS()`, also defined globally. This means that you can `await` it, thereby ensuring that `customJS` will be available when you need it.

```js
await cJS()
```

That said, most of the time **_you do not need to do this_**. In the vast majority of JavaScript execution taking place within Obsidian, customJS will be loaded.

#### Check loading state

You can check the special [state](#state) value of `customJS.state._ready` to determine, if your custom JS code is fully loaded and can be used:

````
```dataviewjs
if (!customJS?.state?._ready) {
  // CustomJS is not fully loaded. Abort the script and do not output anything 
  return
}

// Arriving here means, all customJS properties are ready to be used
customJS.MyModule.doSomething()
```
````

Wait for the plugin to fully load:
````
```js-engine
while (!customJS?.state?._ready) {
  await new Promise(resolve => setTimeout(resolve, 50))
}

// Arriving here means, all customJS properties are ready to be used
customJS.MyModule.doSomething()
```
````

#### The `cJS()` function

CustomJS provides several ways on how to use the `cJS()` function:

1. `async cJS(): customJS` .. The default return value is the [global object](#global-object).
2. `async cJS( moduleName: string ): object` .. Using a string parameter will return a single property of the global object.
3. `async cJS( async Function ): customJS` .. Using a callback function will pass the global object as only parameter to that function.

**Samples**

Access the fully initialized customJS object
````
```dataviewjs
const modules = await cJS()
modules.MyModule.doSomething()
```
````

Access a single module from the customJS object
````
```dataviewjs
const MyModule = await cJS('MyModule')
MyModule.doSomething()
```
````

Run custom code via callback:
````
```dataviewjs
await cJS( customJS => customJS.MyModule.doSomething(dv) )

// Or
await cJS( ({MyModule}) => MyModule.doSomething(dv) )
```
````

Run a custom async-callback when the customJS object is ready:
````
```js-engine
async function runAsync(customJS) {
    await customJS.MyModule.doSomethingAsync(engine)
}
await cJS(runAsync)

// Or, as one-liner:
await cJS( async (customJS) => {await customJS.MyModule.doSomethingAsync(engine)} )
```
````

Note: It's recommended to always use the `await` keyword when calling `cJS()`, even in the last sample (using the callback).

### Invocable Scripts

_Invocable Script_ is the class with the defined method

```js
async invoke() {
  ...
}
```

You can run such scripts via `CustomJS: Invoke Script` command.

Also you can register individual commands via [settings](#registered-invocable-scripts) for the desired script and invoke it via `CustomJS: MyScriptName` command. Additionally you can assign a custom hotkey for that registered commands.

### State

`window.customJS` object is being overridden every time any `js` file is modified in the vault. If you need some data to be preserved during such modifications, store them in `window.customJS.state`.

### `deconstructor` usage

Since the `window.customJS` object is overwritten each time the `js` files are reloaded, the option of defining a `deconstructor` has been added.

In your Javascript class, which you have CustomJS load, you can define a `deconstructor`, which is then called on every reload. This gives you the option of having cleanup work carried out.

```js
deconstructor() {
  ...
}
```

#### Example definition of a `deconstructor`

For example, you can deregister events that you have previously registered:

```js
deconstructor() {
  this.app.workspace.off('file-menu', this.eventHandler);
}
```

### Re-execute the start scripts on reload

There is also the option of having the start scripts re-executed each time the `js` files are reloaded. This can be activated in the settings and is deactivated by default.

#### Complete example `deconstructor` & re-execute start scripts

These two functions, the `deconstructor` and the automatic re-execution of the start scripts, make it possible, for example, to implement your own context menu in Obsidian.

To do this, you must register the corresponding event in the `invoke` start function and deregister it again in the `deconstructor`.

Please be aware of any binding issues and refer to the Obsidian API documentation.

```js
class AddCustomMenuEntry {
  constructor() {
    // Binding the event handler to the `this` context of the class.
    this.eventHandler = this.eventHandler.bind(this);
  }

  async invoke() {
    this.app.workspace.on('file-menu', this.eventHandler);
  }

  deconstructor() {
    this.app.workspace.off('file-menu', this.eventHandler);
  }

  eventHandler(menu, file) {
    // Look in the API documentation for this feature
    //  https://docs.obsidian.md/Plugins/User+interface/Context+menus
    menu.addSeparator();
    menu.addItem((item) => {
      item
        .setTitle('Custom menu entry text..')
        .setIcon('file-plus-2') // Look in the API documentation for the available icons
        .onClick(() => {        //  https://docs.obsidian.md/Plugins/User+interface/Icons
          // Insert the code here that is to be executed when the context menu entry is clicked.
        });
    });
  }
}
```

## ☕️ Support

Do you find CustomJS useful? Consider buying me a coffee to fuel updates and more useful software like this. Thank you!

<a href="https://www.buymeacoffee.com/samlewis" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" height="41" width="174"></a>

## Local development

1. Clone this repository into `<vaultpath>/.obsidian/plugins`

Note: it is recommended to use a test vault when developing plugins.

2. (if you are using node version manager, use the version from package.json -> devDependencies -> @types/node)

3. Install dependencies: `npm install`

4. Build in dev mode with `npm run dev`

NOTE: if you place your repository somewhere else than in `plugins`, you can customize the output path with

`OUTPUT_DIR=<vaultpath>/.obsidian/plugins/obsidian-custom-js npm run dev`

See also:

- Obsidian development guide: https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin
- Hot reloading plugin: https://docs.obsidian.md/Plugins/Getting+started/Development+workflow
