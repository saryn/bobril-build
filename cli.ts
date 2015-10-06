import * as ts from 'typescript';
import * as bb from './index';
import * as chokidar from 'chokidar';
import * as http from 'http';
import * as pathPlatformDependent from "path";
const path = pathPlatformDependent.posix; // This works everythere, just use forward slashes
import * as fs from "fs";

function printIntroLine() {
    let pp = pathPlatformDependent.join(__dirname, 'package.json');
    let bbPackageJson = JSON.parse(fs.readFileSync(pp, 'utf8'));
    console.log('Bobril-build ' + bbPackageJson.version + ' - ' + process.cwd());
}

var compilationCache = new bb.CompilationCache();
var translationDb = new bb.TranslationDb();
var memoryFs: { [name:string]:Buffer } = Object.create(null);
var project: bb.IProject;

function write(fn: string, b: Buffer) {
    console.log(fn);
    memoryFs[fn] = b;
}

function compile(): Promise<any> {
    console.log('Compiling ...');
    let startCompilation = Date.now();
    compilationCache.clearFileTimeModifications();
    return compilationCache.compile(project).then(() => {
        bb.updateSystemJsByCC(compilationCache, project.writeFileCallback);
        bb.updateIndexHtml(project);
    }).then(() => {
        console.log('Compiled in ' + (Date.now() - startCompilation) + 'ms');
    }, e=> {
        console.log(e);
    });
}

function handleRequest(request: http.ServerRequest, response: http.ServerResponse) {
    //console.log('Req ' + request.url);
    if (request.url === '/') {
        response.end(memoryFs['index.html']);
        return;
    }
    let f = memoryFs[request.url.substr(1)];
    if (f) {
        response.end(f);
        return;
    }
    response.statusCode = 404;
    response.end('Not found');
}

function autodetectMainTs(project: bb.IProject): bb.IProject {
    const searchMainTsList = ['index.ts', 'app.ts', 'lib.ts', 'src/index.ts', 'src/app.ts', 'src/lib.ts'];
    for (let i = 0; i < searchMainTsList.length; i++) {
        let fn = searchMainTsList[i];
        if (fs.existsSync(fn)) {
            project.main = fn;
            console.log('Detected main ' + fn);
            project.mainJsFile = fn.replace(/\.ts$/, '.js');
            return project;
        }
    }
    console.log('Error: Main not found. Searched: ' + searchMainTsList.join(', '));
    return null;
}

function createProjectFromPackageJson(): bb.IProject {
    let project: bb.IProject = {
        dir: process.cwd().replace(/\\/g, '/'),
        main: 'src/app.ts',
        mainJsFile: 'src/app.js',
        options: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5, skipDefaultLibCheck: true },
        debugStyleDefs: true,
        releaseStyleDefs: false,
        spriteMerge: false,
        writeFileCallback: write
    };
    let packageJson = null;
    try {
        packageJson = fs.readFileSync('package.json', 'utf-8');
    } catch (err) {
        console.log('Cannot read package.json ' + err + '. Autodetecting main ts file.');
        return autodetectMainTs(project);
    }
    let packageObj = null;
    try {
        packageObj = JSON.parse(packageJson);
    } catch (err) {
        console.log('Package.json cannot be parsed. ' + err);
        return null;
    }
    if (packageObj.typescript && typeof packageObj.typescript.main === 'string') {
        let main = packageObj.typescript.main;
        if (!fs.existsSync(main)) {
            console.log('Package.json typescript.main is ' + main + ', but this file does not exists. Aborting.');
            return null;
        }
        project.main = main;
        project.mainJsFile = main.replace(/\.ts$/, '.js');
    } else {
        console.log('Package.json missing typescript.main. Autodetecting main ts file.');
        project = autodetectMainTs(project);
        if (project == null) return null;
    }
    let bobrilSection = packageObj.bobril;
    if (bobrilSection == null) return project;
    if (typeof bobrilSection.title === 'string') {
        project.htmlTitle = bobrilSection.title; 
    }
    return project;
}

export function run() {
    printIntroLine();
    project = createProjectFromPackageJson();
    if (project == null) return;
    let startWatching = Date.now();
    chokidar.watch(['**/*.ts', '**/tsconfig.json', 'package.json'], { ignored: /[\/\\]\./, ignoreInitial: true }).once('ready', () => {
        console.log('Watching in ' + (Date.now() - startWatching).toFixed(0)+'ms');
        compile().then(() => {
            var server = http.createServer(handleRequest);
            server.listen(8080, function () {
                console.log("Server listening on: http://localhost:8080");
            });
        });
    }).on('all', bb.debounce((v,v2) => {
        compile();
    }));
}