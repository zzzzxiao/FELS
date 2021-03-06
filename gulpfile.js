"use strict";
var gulp = require("gulp");
var path = require("path");
var fs = require("fs-extra-async");
var gutil = require("gulp-util");
var through = require("through2");
var uglifyOpt = {

	//保留IE的jscript条件注释
	preserveComments: (o, info) => {
		return /@(cc_on|if|else|end|_jscript(_\w+)?)\s/i.test(info.value);
	}
};

// 是否在浏览器端汇报js与css错误
var reporter = ("REPORTER" in process.env) ? Boolean(process.env.REPORTER) : true;

// 项目根目录设置
var baseDir = process.cwd();

// gulp 插件引用开始
// gulp缓存插件，只传递变化了的文件
var cache = require("gulp-cached");

// gulp缓存读取插件，读取缓存中的内容
var remember = require("gulp-remember");

// gulp异常处理插件
var plumber = require("gulp-plumber");

// gulp 插件引用结束

var isDev;

/**
 * 将函数处理为文件数据流处理函数
 * @param  {Function} callback  接收文件对象的函数，如需修改文件内容，请返回字符串或者Promise对象
 * @param  {String}   debugname 调试信息名称，用于gulp报错时显示出错位置
 * @return {Stream}             Stream对象，可用于继续pipe
 */
function getFile(callback, debugname) {
	return through.obj((file, encoding, cb) => {
		function sendError(err) {

			// 将异常信息转化为gulp格式
			cb(new gutil.PluginError(debugname, file.path + ": " + (err.message || err.msg || "unspecified error"), {
				fileName: file.path,
				lineNumber: err.line,
				stack: err.stack,
				showStack: true
			}));
		}

		// 将处理结果传回文件数据流
		function sendResult(content) {
			if (content) {
				file.contents = new Buffer(content);
			}
			cb(null, file);
		}

		if (file.isNull()) {
			return cb(null, file);
		}

		if (file.isStream()) {
			return sendError(new Error("Streaming not supported"));
		}

		var content;
		try {
			content = callback(file.contents.toString(), file);
		} catch (err) {
			return sendError(err);
		}

		if (content) {
			if (!(content instanceof Promise)) {
				content = Promise.resolve(content);
			}
			content.then(sendResult).catch(sendError);
		} else {
			cb(null, file);
		}
	});
}

// Stylelint reporter config
var warnIcon = encodeURIComponent(`<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="48px" height="48px" viewBox="0 0 512 512" enable-background="new 0 0 512 512" xml:space="preserve"><path fill="#A82734" id="warning-4-icon" d="M228.55,134.812h54.9v166.5h-54.9V134.812z M256,385.188c-16.362,0-29.626-13.264-29.626-29.625c0-16.362,13.264-29.627,29.626-29.627c16.361,0,29.625,13.265,29.625,29.627C285.625,371.924,272.361,385.188,256,385.188z M256,90c91.742,0,166,74.245,166,166c0,91.741-74.245,166-166,166c-91.742,0-166-74.245-166-166C90,164.259,164.245,90,256,90z M256,50C142.229,50,50,142.229,50,256s92.229,206,206,206s206-92.229,206-206S369.771,50,256,50z"/>
</svg>`);
var stylelintReporterConfig = {
	styles: {
		"display": "block",

		"margin": "1em",
		"font-size": ".9em",
		"padding": "1.5em 1em 1.5em 4.5em",

		/* padding + background image padding */

		/* background */
		"color": "white",
		"background-color": "#DF4F5E",
		"background": `url("data:image/svg+xml;charset=utf-8,${ warnIcon }") .5em 1.5em no-repeat, #DF4F5E linear-gradient(#DF4F5E, #CE3741)`,

		/* sugar */
		"border": "1px solid #C64F4B",
		"border-radius": "3px",
		"box-shadow": "inset 0 1px 0 #EB8A93, 0 0 .3em rgba(0,0,0, .5)",

		/* nice font */
		"white-space": "pre-wrap",
		"font-family": "Menlo, Monaco, monospace",
		"text-shadow": "0 1px #A82734"
	}
};

/*
var jsModule = getFile((content, file) => {
	// 模块加载器、非js模块普通文件，cmd规范模块，不作处理
	if (/\/common(?:\Wmin)?\.js$/.test(file.path) || !/\b(?:define\(|module|exports|require\()\b/.test(content) || /\bdefine\.cmd\b/.test(content)) {
		return content;
	}
	var isAmd;
	content = content.replace(/\bdefine\.amd\b/, () => {
		isAmd = true;
		return "define.useamd()";
	});
	if (isAmd || /\bdefine\(\b/.test(content)) {
		return content;
	}
	// CommonJS 规范的 js module.
	var deps = [];

	function addDesp(moduleName) {
		if (!/^(?:common)$/.test(moduleName)) {
			deps.push(JSON.stringify(moduleName));
		}
		return "";
	}

	content.replace(/\/\/[^\r\n]+/g, "").replace(/\/\*.+?\*\//g, "").replace(/\brequire\(\s*(["'])([^"']+)\1\s*\)/g, (s, quotes, moduleName) => {
		// 分析代码中的`require("xxxx")`语句，提取出模块名字
		return addDesp(moduleName);
	}).replace(/\bimport\b[^;]+?\bfrom\s+(["'])([^"']+)\1/g, (s, quotes, moduleName) => {
		// 分析代码中的`import`语句，提取出模块名字
		return addDesp(moduleName);
	});

	if (deps.length) {
		deps = `,[${ deps.join(",") }]`;
	} else {
		deps = "";
	}

	content = content.trim();

	// 对整个js块包裹CMD规范的标准Wrap
	content = `(function(f){typeof define==="function"?define("${ file.path }"${ deps },f):f()})(function(require,exports,module){
${ content }
});`;
	return content;
}, "jsModule");
*/

/**
 * 检查代码去除块注释后、合并连续换行符之后，还有有几行
 * @param  {String} code 要检查的代码
 * @return {Number}      代码行数
 */
function lineCount(code) {
	var lineCount = code.replace(/\/\*(?:.|\r?\n)+?\*\//g, "").replace(/(?:\r?\n)+/g, "\n").trim().match(/\n/g);
	return lineCount ? lineCount.length : 0;
}

/**
 * 检查代码是否压缩版本
 * @param  {Buffer|String} contents 要检查的代码
 * @return {Boolean}       代码是否压缩版
 */
function isMinFile(contents) {
	contents = contents.toString();
	return !contents || /\bsourceMappingURL=[^\n]+\.map\b/.test(contents) || lineCount(contents) < 3;
}

function jsPipe(stream) {
	if (isDev) {
		const eslint = require("gulp-eslint");

		// js代码美化
		stream = stream.pipe(eslint({
			fix: true
		}));

	} else {
		stream = stream.pipe(require("gulp-sourcemaps").init())

		// js代码压缩
		.pipe(require("gulp-uglify")(uglifyOpt));
	}

	// 兼容ES6
	// stream = stream.pipe(require("gulp-babel")())

	// 解决压缩js会破坏AngularJS文件所需的依赖注入问题
	// .pipe(require("gulp-ng-annotate")());

	// AMD、CDM模块封装
	stream = stream.pipe(getFile((contents, file) => {
		if (!/\bdefine\(/i.test(contents) && (/\brequire\(/i.test(contents) || /(?:\bmodule|exports)\s*=[^=]/i.test(contents))) {
			return `(function(f){typeof define==="function"?define("/${ file.relative.replace(/\\/g, "/") }",f):f()})(function(require,exports,module){${
contents
}});`;
		}
	}, "AMD、CDM模块封装"));

	if (isDev && reporter) {

		// jshint错误汇报
		const reporter = require("./lib/gulp-reporter");

		stream = stream.pipe(reporter({
			browser: true
		}));
	}
	return stream;
}

var RcLoader = require("rcloader");
var rcCache = {};
var cacheNotification = {};
var notifyBasy;
var notifier = require("node-notifier");
notifier.on("timeout", function() {
	notifyBasy = false;
	notify();
});

function notify() {
	function show(filePath) {
		notifyBasy = true;
		var opts = cacheNotification[filePath];
		opts.message = "发现未规范化的代码，点击修复此问题。\n" + filePath;
		opts.sound = true;
		opts.time = 5000;
		opts.wait = true;
		notifier.notify(opts, function(err, response) {

			// Response is response from notification
			if (!err && response === "activate") {
				fs.writeFile(filePath, opts.newCode, function(err) {
					if (!err) {
						gutil.log("文件被自动修复：\n" + filePath);
					}
				});
				delete cacheNotification[filePath];
				notifyBasy = false;
				notify();
			}
		});
	}

	if (notifyBasy) {
		return;
	}
	for (var filePath in cacheNotification) {
		show(filePath);
		return;
	}
	notifyBasy = false;
}

/**
 * 代码美化，调用opts.beautify函数美化代码后，如果代码产生变化，则修改源代码
 * @param  {Stream}			stream				包含文件的数据流
 * @param  {Object}			opts				参数
 * @param  {String}			[opts.rcName]		配置文件文件名，供rcloader组件加载配置用
 * @param  {Function}		[opts.beautify]		代码美化函数，参数三个，{String}旧代码、{Object}rcloader找到的配置、{vinyl}文件对象
 * @param  {String}			[opts.title]		代码美化的行为的名字，用于气泡提示的标题和报错信息中
 * @param  {Buffer|String}	[opts.icon]			弹出的气泡提示中的图片，可为文件内容的buffer，或文件路径、或文件url
 * @param  {Boolean}		[opts.lazy]			值为真时，美化后的代码写入stream，否则调用气泡提示，待用户点击后写入新代码到文件
 * @return {Stream}								原样返回的stream，与原始值一样
 */
function codeBeautify(stream, opts) {
	var plugin = getFile((code, file) => {
		var rcLoader = rcCache[opts.rcName] || (rcCache[opts.rcName] = new RcLoader(opts.rcName, {
			defaultFile: path.join(__dirname, opts.rcName)
		}));

		var filePath = file.path;

		code = code.replace(/\r\n/g, "\n");

		function lazyResult(resolve) {
			rcLoader.for(filePath, function(err, rc) {
				if (err) {
					rc = {};
				}
				opts.beautify(code, rc, file).then(newCode => {

					// 是否生成了新代码
					if (newCode) {

						// 新代码与老代码是否相同
						if (newCode.trim() === code.trim()) {
							delete cacheNotification[filePath];
						} else {

							// 为新代码文件结尾添加一个空行
							newCode = newCode.replace(/\n*$/, "\n");
							if (resolve) {

								// Promise方式返回新代码
								resolve(newCode);
							} else {

								// 将新代码交给气球提示流程
								opts.newCode = newCode;
								cacheNotification[filePath] = opts;
								notify();
							}
							return;
						}
					}

					// Promise方式返回新代码
					if (resolve) {
						resolve();
					}
				}).catch(err => {
					console.error(err.stack || err);
				});
			});
		}
		if (opts.lazy) {
			lazyResult();
		} else {
			return new Promise(lazyResult);
		}
	}, opts.title);
	if (stream) {
		return stream.pipe(plugin);
	} else {
		return plugin;
	}
}

/**
 * CSS代码美化
 * @param  {Stream} stream 文件数据流
 * @param  {Booleab} lazy  设置为true时，美化后的代码等待用户点击气泡提示后写入文件，否则，将美化后的代码写入文件数据流
 * @return {Stream}        数据流
 */
function cssBeautify(stream, lazy) {
	return codeBeautify(stream, {
		title: "css beautify",
		icon: "https://avatars1.githubusercontent.com/u/38091",
		"rcName": ".csscomb.json",
		lazy: lazy,
		beautify: function(css, config, file) {
			var postcss = require("postcss");
			var processors = [
				require("postcss-unprefix")
			];
			return postcss(processors).process(css).then(result => {
				var comb = new require("csscomb")(config || "csscomb");
				return comb.processString(result.css, {
					syntax: file.path.split(".").pop(),
					filename: file.path
				});
			});
		}
	});
}

// css工作流
function cssPipe(stream) {
	var processors = [
		isDev ? require("stylelint")() : null,

		// css未来标准提前使用
		require("postcss-cssnext")({
			features: {
				"autoprefixer": {
					browsers: ["last 3 version", "ie > 8", "Android >= 3", "Safari >= 5.1", "iOS >= 5"],

					// should Autoprefixer use Visual Cascade, if CSS is uncompressed.
					cascade: false,

					// If you have no legacy code, this option will make Autoprefixer about 10% faster.
					remove: false
				}
			}
		}),

		// scss风格的预处理器
		// require("precss")(),
		// IE8期以下兼容rem
		require("pixrem"),

		// IE9兼容vmin
		require("postcss-vmin"),

		// IE8以下兼容合集
		// require("cssgrace"),
		// background: linear-gradient(to bottom, #1e5799, #7db9e8);输出为IE滤镜
		require("postcss-filter-gradient"),

		// 静态资源版本控制
		require("postcss-url")({
			useHash: true,
			url: "copy" // or "inline" or "copy"
		}),
		isDev && reporter ? require("postcss-browser-reporter")(stylelintReporterConfig) : null,
		isDev ? require("postcss-reporter")({
			formatter: reporter ? input => {
				return input.source + " produced " + input.messages.length + " messages";
			} : undefined,
			clearMessages: true
		}) : require("cssnano")()
	];

	if (isDev) {

		// CSS代码美化
		stream = cssBeautify(stream, true);
	} else {

		// css sourcemaps初始化
		stream = stream.pipe(require("gulp-sourcemaps").init());
	}

	// 过滤掉空的postcss插件
	processors = processors.filter(processor => processor);

	stream = stream.pipe(require("gulp-postcss")(processors));

	return stream;
}

// html工作流
function htmlPipe(stream) {
	return stream;
}

module.exports = (staticRoot, env) => {

	isDev = env === "development";

	baseDir = staticRoot || process.cwd();

	var sendFileCache = {};

	/**
	 * 获取文件sourceMap，sourceMap文件写入缓存(sendFileCache), return sourceMap路径声明注释
	 * @param  {vinyl} file		要获取sourceMap的文件
	 * @return {String}			若file有sourceMap，则返回换行符开头的文件注释，注释内容为sourceMap路径声明
	 */
	function getSourceMap(file) {
		if (file.sourceMap && !/\bsourceMappingURL=[^\n]+\.map\b/.test(file.contents)) {

			file.sourceMap.sourceRoot = "//view-source/";
			var sourceMap = JSON.stringify(file.sourceMap),
				sourceMapPath = file.path + ".map",
				url = sourceMapPath.replace(/^.*[\/\\]/, ""),
				sourceMapFile = new gutil.File({
					cwd: file.cwd,
					base: file.base,
					path: sourceMapPath,
					contents: new Buffer(sourceMap)
				});

			sourceMapFile.etag = require("etag")(file.contents);
			sendFileCache[sourceMapPath] = sourceMapFile;

			return /\.js$/.test(file.path) ? "\n//# sourceMappingURL=" + url : "\n/*# sourceMappingURL=" + url + " */";
		}
		return "";
	}


	function sendFile(relativePath) {
		function gulpSrc(filename, buffer) {
			var src = require("stream").Readable({
				objectMode: true
			});
			src._read = () => {
				src.push(new gutil.File({
					cwd: baseDir,
					base: baseDir,
					path: filename,
					contents: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
				}));
				src.push(null);
			};
			return src;
		}

		var pipeFn;
		var filePath = path.join(baseDir, relativePath);

		if (sendFileCache[filePath]) {

			// 如果外部请求的文件正好缓存中有，则发送出去，然后清除缓存中的此文件
			// sourceMap之类情况就是这样，上次请求js时生成的map文件放在缓存中，浏览器下次来取
			return Promise.resolve(sendFileCache[filePath]);
		} else if (/[\.\-]min\.\w+$/.test(filePath)) {

			// 已压缩文件，不作处理
			return;
		} else if (/\.js$/i.test(filePath)) {
			pipeFn = jsPipe;
		} else if (/\.css$/i.test(filePath)) {
			pipeFn = cssPipe;
		} else if (/\.html?$/i.test(filePath)) {
			pipeFn = htmlPipe;
		} else {
			pipeFn = null;
		}
		return fs.readFileAsync(filePath)

		.catch(() => {
			return null;
		})

		.then(data => {
			if (!data) {
				return;
			}

			// 如果文件为压缩文件，则不做工作流处理
			if (pipeFn && isMinFile(data)) {
				pipeFn = null;
			}

			return new Promise((resolve, reject) => {
				var stream = gulpSrc(filePath, data)

				// 错误汇报机制
				.pipe(plumber(ex => {
					reject(ex);
					delete cache.caches[filePath][filePath];
					remember.forget(filePath, filePath);
				}))

				// 仅仅传递变化了的文件
				.pipe(cache(filePath));

				if (pipeFn) {

					// 调用正式的gulp工作流
					stream = pipeFn(stream);

					// 处理文件的sourceMap
					stream = stream.pipe(getFile((content, file) => {

						// 在文件末尾添加一行sourceMap注释
						var sourceMapComment = getSourceMap(file);
						if (sourceMapComment) {
							return content.replace(/\n*$/, sourceMapComment);
						}
					}, "sourceMap"));
				}

				// 获取缓存中的数据
				stream.pipe(remember(filePath))

				// 取出文件内容，返回给外部
				.pipe(through.obj((file, encoding, cb) => {
					file.etag = require("etag")(file.contents);

					// 如果获取到的文件正好是外部要获取的文件，则发送给外部
					if (file.path === filePath) {
						resolve(file);
					} else {

						// 如果获取到的文件是sourceMap之类的文件，先放进缓存，等外部下次请求时发送
						sendFileCache[file.path] = file;
					}
					cb();
				}));
			});
		});
	}
	return sendFile;
};

/**
 * 获取文件size
 * @param  {Vinyl} file 要获取size的文件
 * @return {int}   文件size，单位字节
 */
function getFileSize(file) {
	if (file.contents && file.contents.length) {
		return file.contents.length;
	} else if (file.stat && file.stat.size) {
		return file.stat.size;
	} else {
		return 0;
	}
}

/**
 * 字节数目转化为描述大小的字符，如`20MB`、`15KB`
 * @param  {Int} 	byte 字节数
 * @return {String}      文件大小描述字符串
 */
function byteStringify(byte) {
	var units = ["B", "KB", "MB", "GB", "TB"];
	while (byte >= 1024 && units.length > 1) {
		byte /= 1024;
		units.shift();
	}
	return String(byte).replace(/(\.\d{3})\d+/, "$1") + units.shift();
}

function fileUploader(configs) {
	var baseDir = configs.base ? require("url").resolve("/", configs.base.replace(/\/?$/, "/")) : "/";

	/**
	 * API 方式文件上传
	 * @param  {Vinyl} fileVinyl https://github.com/gulpjs/vinyl
	 * @return {Promise} 异步操作对象，Promise格式
	 */
	return function(fileVinyl) {
		var filePath = fileVinyl.relative.replace(/\\/g, "/").match(/^(?:(.*)\/)?([^\/]+)$/);

		var configfile = {
			"path": baseDir + (filePath[1] || ""),
			"user": configs.user,
			"password": configs.password,
			"fileName": filePath[2]
		};
		var formData = {
			configfile: JSON.stringify(configfile),
			imagefile: {
				value: fileVinyl.contents || require("fs").createReadStream(fileVinyl.path),
				options: {
					filename: filePath[2],
					contentType: require("mime-types").lookup(filePath[2])
				}
			}
		};
		return new Promise((resolve, reject) => {
			require("request").post({
				url: configs.url || "http://192.168.20.69:8000/upload",
				formData: formData,
				headers: {
					"Connection": "Close"
				}
			}, function(err, httpResponse, body) {
				if (err) {
					reject(err);
				} else {
					try {
						body = JSON.parse(body);
					} catch (ex) {
						reject({
							message: body
						});
						return;
					}
					if (body.code === 1000) {
						body.file = fileVinyl;
						resolve(body);
					} else {
						reject({
							code: body.code,
							message: body.info
						});
					}
				}
			});
		}).catch(err => {
			if (err && !err.file) {
				err.file = fileVinyl;
			}
			throw err;
		});
	};
}

// 目录遍历，排除.*、node_modules、*.log
function fsWalker(rootDir) {
	rootDir = path.resolve(rootDir);

	function walker(rootDir) {
		return new Promise((resolve, reject) => {

			// 遍历当前目录下的子对象
			fs.readdirAsync(rootDir).then(subNames => {

				// 储存当前目录下的子目录的遍历Promise对象
				var subDirs = [];

				// 储存当前目录下的文件
				var subFiles = [];

				// 排除`.*`、`node_modules`
				subNames = subNames.filter(subName => {
					return !/^(?:node_modules|\..*)$/i.test(subName);
				}).map(subName => {
					var subPath = path.join(rootDir, subName);

					// 异步获取子对象状态
					return fs.statAsync(subPath).then(stat => {
						if (stat.isDirectory()) {

							// 子对象是个目录，则递归查询
							subDirs.push(walker(subPath));
						} else {

							// 子对象是个文件
							subFiles.push({
								path: subPath,
								stat: stat
							});
						}
						return stat;
					});
				});

				// 等待所有fs.statAsync操作完成
				Promise.all(subNames).then(() => {

					// 获取所有子目录的遍历结果
					Promise.all(subDirs).then(subDirsChilds => {

						// 将子目录的遍历结果，与当前目录的遍历结果，合为一个数组
						resolve(subFiles.concat.apply(subFiles, subDirsChilds));
					}).catch(reject);
				}).catch(reject);
			});
		});
	}

	// 将最终结果在返回前，将结果包装为对象
	return walker(rootDir).then(paths => {
		return paths.map(file => {
			file.base = rootDir;
			file.relative = path.relative(rootDir, file.path).replace(/\\/g, "/");
			return file;
		});
	});
}

function saveStatus(files, dir, tag) {
	var filecache;
	tag = path.resolve(dir) + "#" + tag;

	try {
		filecache = require("./.filecache.json");
	} catch (ex) {
		filecache = {};
	}

	var cache = filecache[tag];

	if (!cache) {
		cache = {};
		filecache[tag] = cache;
	}

	files.forEach(file => {
		if (file.status === "?") {
			cache[file.relative] = file.stat.mtime.valueOf();
		}
	});

	fs.outputJson(path.join(__dirname, "./.filecache.json"), filecache);
}

/**
 * 将子路径转为文件对象数组
 * @param  {Array}		paths	[String] paths 文件相对路径数组
 * @param  {String}		baseDir	文件根目录
 * @return {Promise}			Promise对象的返回值为 {Vinyl[]} 数组 https://github.com/gulpjs/vinyl
 */
function path2vinyl(paths, baseDir) {

	// 将文件相对路径数组转换成Vinyl数组
	paths = paths.map(subPath => {
		var filePath = path.join(baseDir, subPath);
		return fs.statAsync(filePath)

		.then(stat => {
			return {
				base: baseDir,
				path: filePath,
				relative: subPath,
				stat: stat
			};
		}).catch(() => {
			return null;
		});
	});

	// 将整个数组转化为Promise对象
	return paths = Promise.all(paths)

	// 过滤数组中的空文件
	.then(files => files.filter(file => file));
}

/**
 * 获得代码库中的新文件
 * @param  {[type]} 	dir		代码库路径
 * @param  {[String]}	tag		代码库标记
 * @return {Array}     	[vinyl] 格式的数组
 */
function getNewFiles(dir, tag) {
	dir = path.resolve(dir);
	return Promise.all([require("./lib/getrepdiff")(dir, tag), require("./lib/getrepunknown")(dir, tag)]).then(filesArray => {
		return path2vinyl(filesArray[0].concat(filesArray[1]), dir);
	});
}

gulp.task("publish", (cb) => {

	var program = new(require("commander").Command)("gulp publish");

	program
		.option("--url [url]", "文件上传服务API", String, "")
		.option("--username [username]", "API用户名", String)
		.option("--password [password]", "API密码", String)
		.option("--diff [git/hg tag]", "与指定的git或hg tag比较差异", String, "")
		.option("--base [path]", "要上传到远程服务器哪个目录", String, "/")
		.option("--dir [path]", "要上传本地哪个目录", String, ".")
		.option("--queue [int]", "上传时并发数", parseInt, 20)
		.option("--retry [int]", "上出错时重试次数", parseInt)
		.option("--ci", "自动构建模式")

	.parse(process.argv);

	if (!program.password || !program.url) {

		// 显示帮助信息
		program.help();
		return;
	}

	var uploader = fileUploader({
		"url": program.url,
		"base": program.base || "/",
		"user": program.username,
		"password": program.password
	});

	function getFsWalker() {
		console.log("正在遍历文件：" + path.resolve(program.dir));
		var getFiles = fsWalker(program.dir)

		.catch(ex => {
			console.error("文件遍历出错：", ex);
		});
		return getFiles;
	}

	var getFiles;
	var author;
	if (program.ci) {
		require("./lib/getrepauthor.js")(program.dir)

		.then(authorInfo => {
			author = authorInfo;
		});
	}

	if (program.diff) {
		console.log("正在查询与上一版本的文件差异");
		getFiles = getNewFiles(program.dir, program.diff)

		.catch(ex => {
			console.error("获取代码库版本差异出错：", ex.message);
			return getFsWalker();
		});
	} else {
		getFiles = getFsWalker();
	}

	getFiles.then(files => {
		files = files.filter(file => {

			// 排除`gulpfile.js`、 `gruntfile.js`、 `package\.json`、`*.log`,、`*.less`,、`*.sass`,、`*.coffee`,、`*.ts`,、`*.es*`,
			return !/(?:^|\/)(?:package\.json|gruntfile\.js|[^/]+\.(?:log|less|sass|scss|coffee|ts|es\d)|\.[^./]+)$/i.test(file.relative);
		});
		var succCount = 0;
		var total = 0;
		files.forEach(file => {
			total += getFileSize(file);
		});
		console.log("需要上传" + files.length + "个文件，共" + byteStringify(total) + "。");

		// 进度条
		var ProgressBar;
		var bar;


		if (!program.ci) {

			// 进度条
			ProgressBar = require("progress");
			bar = new ProgressBar("[:bar] :percent :elapseds :etas", {
				total: total,
				width: 40
			});
		}
		var errors = [];
		var percent;

		// 建立任务队列
		var Queue = require("queue-fun").Queue();
		var queue = new Queue(program.queue, {

			// 失败时重试次数
			retryON: program.retry || (program.ci ? 50 : 20),

			// 失败时搁置
			retryType: false,

			// 上传成功
			event_succ: function(data) {
				succCount++;
				if (bar) {
					bar.tick(getFileSize(data.file));
				} else {
					var newPercent = Math.min(100, Math.round(succCount * 100 / files.length));
					if (newPercent !== percent) {
						percent = newPercent;
						console.log(percent + "%");
					}
				}
			},

			// 报错次数超出上限
			event_err: function(err) {
				if (err && err.code === 1001) {
					queue.clear();
					console.error(err.message);
				} else {
					if (bar) {
						bar.tick(getFileSize(err.file));
					} else {
						console.error(err.message || err.code || err, err.file ? err.file.relative : "");
					}
				}
				errors.push(err);
			},
			event_end: function() {
				if (errors.length) {
					errors = errors.map(error => {
						if (error.file) {
							error.file = error.file.relative || error.file;
						}
						return error;
					});
					errors = require("util").inspect(errors, {
						showHidden: true
					});
					console.error(errors);
					cb();
				} else {
					console.log("上传完毕。");
					if (program.diff) {
						saveStatus(files, program.dir, program.diff);
						console.log("正在同步tag：", program.diff);

						require("./lib/addreptag")(program.dir, program.diff)

						.then(() => {
							console.log("tag同步成功：", program.diff);
						})

						.catch(error => {
							console.error("tag同步出错：", error.message);
						})

						.then(() => {
							if (program.ci) {
								console.log(files.map(file => file.relative).join("\n"));
								if (author) {
									console.log("发邮件流程模拟", author);
								}
							}
							cb();
						});
					} else {
						cb();
					}
				}
			}
		});

		queue.allArray(files, uploader);
		queue.start();
	});
});

gulp.task("server", cb => {
	var program = new(require("commander").Command)("gulp server");

	program
		.option("--env [development]", "服务器运行环境，默认`development`", String, "development")
		.option("--path [path]", "服务器根目录", String, "")
		.option("--port [Number|path]", "监听端口号，或者unix套接字, 默认`80`/`443`", String, "")
		.option("--no-reporter [Boolean]", "是否关闭客户端代码错误汇报, 默认不关闭", Boolean)
		.option("--dns [ip]", "回源功能使用的DNS服务器", String, "")

	.parse(process.argv);

	if (!program.path) {

		// 显示帮助信息
		program.help();
		return;
	}

	require("child_process").fork(require.resolve("./server.js"), {
		cwd: path.resolve(program.path),
		env: {
			REPORTER: program.reporter || "",
			PORT: program.port || "",
			DNS: program.dns || "",
			NODE_ENV: program.env
		}
	}, cb);
});

gulp.task("hook", () => require("./lib/task-addhooks")());

gulp.task("precommit", require("./lib/task-precommit"));

gulp.task("default", require("./lib/task-default"));

process.on("uncaughtException", (error) => {
	console.error(error);
});
