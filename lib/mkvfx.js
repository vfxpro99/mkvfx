#! /usr/bin/env node
/*
 * mkvfx
 * https://github.com/meshula/mkvfx
 *
 * Copyright 2014 Nick Porcino
 * Licensed under the MIT license.
 */

'use strict';

var stdout = process.stdout;

// when other platforms are tested, this should be a platform detection block
// resolving to recipe_osx, recipe_darwin, recipe_linux, recipe_windows, recipe_ios, etc.
var platform = "";
var platform_compiler = "";
var recipes_file = "";       /// @TODO read from command line

if (process.platform === "darwin") {
    platform = "osx";
    platform_compiler = "clang";
    recipes_file = "recipes-osx64.json";
}

if (process.platform === "win32") {
    if (!process.env.DXSDK_DIR)
        process.env["DXSDK_DIR"] = " "; // Some cmake recipes still believe in this obsolete variable
        
    recipes_file = "recipes-win64.json";
    platform = "windows";
    platform_compiler = "vs2015";
}

if (platform === "") {
    var msg = "Platform: " + process.platform + " not supported";
    stdout.write(msg);
    var err = [];
    err.message = msg;
    throw err;
}

var platform_recipe = "recipe_" + platform;
var platform_install = "install_" + platform;
var platform_dependencies = "dependencies_" + platform;

var cwd = process.cwd();

function userHome() {
  if (platform === "windows") {
     // on windows USERPROFILE starts with drive letter, so prefer that to HOMEPATH
     return process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH;
  }
  return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
}

var home = userHome();

var mkvfx_root = cwd + "/local";
var mkvfx_source_root = home + "/mkvfx-sources";
var mkvfx_build_root = home + "/mkvfx-build";

var
    ansi = require('ansi'),
    cursor = ansi(process.stdout),
    exec = require("child_process").exec,
    execSync = require("child_process").execSync,
    fs = require('fs'),
    mkdirp = require('mkdirp');

// var token = 0;

var lower_case_map = {};
var built_packages = {};
var package_recipes;

var option_do_fetch = 1;
var option_do_build = 1;
var option_do_install = 1;
var option_do_dependencies = 1;

var searchedFor7zip = false;
var found7zip = false;
var searchedForCmake = false;
var foundCmake = false;
var searchedForMake = false;
var foundMake = false;
var searchedForPremake = false;
var foundPremake = false;

exports.version = function() { return "0.1.0"; };

var args = process.argv.slice(2);

cursor.white();
stdout.write("\nmkvfx " + exports.version() + "\n\n");

function platform_path(path) {
  //  if (patform === "windows")
        return '"' + path + '"';

   return path;
}

String.prototype.trim = function () {
    return this.replace(/^\s*/, "").replace(/\s*$/, "");
};

function substitute_variables(subst) {
    var result = subst.replace("$(MKVFX_ROOT)", mkvfx_root);
    result = result.replace("$(MKVFX_SRC_ROOT)", mkvfx_source_root);
    result = result.replace("$(MKVFX_BUILD_ROOT)", mkvfx_build_root);
    if (result != subst) {
        result = substitute_variables(result);
    }
    return result;
}

function execTask(task, workingDir) {
    cursor.yellow();
    stdout.write("Running: " + task + "\n");
    cursor.fg.reset();

    var result;

    try {
        if (platform === "osx") {
            //usleep(0); // allow kernel to have a kick at the can, necessary for ln to succeed
        }

        if (workingDir) {
            result = execSync(task, {encoding:"utf8", cwd:workingDir});
        }
        else {
            result = execSync(task, {encoding:"utf8"});
        }
    }
    catch (e) {
        if (e.message != "spawnSync ENOTCONN") {
            // seems to be a bug in node.js version 0.11.14
            // calling ln results in an ENOTCONN.
            stdout.write(e.message + "\n");
            //stdout.write("%s %s %d:%d\n\n", e.name, e.fileName, e.lineNumber, e.columnNumber);
            stdout.write(e.stack);
            stdout.write("\n\n");
            throw e;
        }
        result = "";
    }

    stdout.write(result);
    stdout.write("\n");
}


function check_for_7zip() {
	if (found7zip) {
		return true;
	}
	if (searchedFor7zip) {
		return false;
	}
	var result = true;
	try {
		result = execTask('7z > $null');
	}
	catch (err) {
		//...
	}
	searchedFor7zip = true;
	if (!result) {
		found7zip = true;
	}
	return found7zip;
}


function check_for_make() {
    if (platform == "windows") {
        // nb: make on Windows is pretty darn sketchy at best. don't test.
        return true;
    }
	if (foundMake) {
		return true;
	}
	if (searchedForMake) {
		return false;
	}
	var result = true;
	try {
		result = execTask('make --version');
	}
	catch (err) {
		//...
	}
	searchedForMake = true;
	if (!result) {
		foundMake = true;
	}
	return foundMake;
}


function check_for_cmake() {
	if (foundCmake) {
		return true;
	}
	if (searchedForCmake) {
		return false;
	}
	var result = true;
	try {
		result = execTask('cmake --version');
	}
	catch (err) {
		//...
	}
	searchedForCmake = true;
	if (!result) {
		foundCmake = true;
	}
	return foundCmake;
}

function check_for_premake() {
	if (foundPremake) {
		return true;
	}
	if (searchedForPremake) {
		return false;
	}
	var result = true;
	try {
		execTask('premake4 --version');
	}
	catch (err) {
		result = false;
	}
	searchedForPremake = true;
	if (result) {
		foundPremake = true;
	}
	return foundPremake;
}

function validate_tool_chain() {
    if (platform === "windows") {
        if (process.env.VisualStudioVersion === undefined) {
            cursor.red();
            stdout.write("Environment does not have Visual Studio environment variables\n");
            cursor.fg.reset();
            stdout.write("Re-run after running VSVARS23.BAT\n");
            stdout.write("If running Powershell, invoke PowerShell from a Visual Studio CMD prompt, using 'powershell'\n");
            err = "Incorrect environemnt";
            throw err;
        }
    }
    stdout.write("Validating directory structure\n");
    if (!fs.existsSync(mkvfx_root)) {
        fs.mkdir(mkvfx_root, function(err) {
            if (err) {
                cursor.red();
                stdout.write("MKVFX Could not create dir: " + mkvfx_root);
                cursor.fg.reset();
                throw err;
            }
        });
    }
    if (!fs.existsSync(mkvfx_root+"/bin")) {
        fs.mkdir(mkvfx_root+"/bin", function(err) {
            if (err) {
                cursor.red();
                stdout.write("MKVFX Could not create dir: " + mkvfx_root + "/bin\n");
                cursor.fg.reset();
                throw err;
            }
        });
    }
    if (!fs.existsSync(mkvfx_root+"/include")) {
        fs.mkdir(mkvfx_root+"/include", function(err) {
            if (err) {
                cursor.red();
                stdout.write("MKVFX Could not create dir: " + mkvfx_root + "/include\n");
                cursor.fg.reset();
                throw err;
            }
        });
    }
    if (!fs.existsSync(mkvfx_root+"/lib")) {
        fs.mkdir(mkvfx_root+"/lib", function(err) {
            if (err) {
                cursor.red();
                stdout.write("MKVFX Could not create dir: " + mkvfx_root + "/lib\n");
                cursor.fg.reset();
                throw err;
            }
        });
    }
    if (!fs.existsSync(mkvfx_root + "/man")) {
        fs.mkdir(mkvfx_root + "/man", function(err) {
            if (err) {
                cursor.red();
                stdout.write("MKVFX Could not create dir: " + mkvfx_root + "/man\n");
                cursor.fg.reset();
                throw err;
            }
        });
    }
    if (!fs.existsSync(mkvfx_root + "/man/man1")) {
        fs.mkdir(mkvfx_root + "/man/man1", function(err) {
            if (err) {
                cursor.red();
                stdout.write("MKVFX Could not create dir: " + mkvfx_root + "/man/man1\n");
                cursor.fg.reset();
                throw err;
            }
        });
    }
    if (!fs.existsSync(mkvfx_source_root)) {
        fs.mkdir(mkvfx_source_root, function(err) {
            if (err) {
                cursor.red();
                stdout.write("MKVFX Could not create dir: " + mkvfx_source_root + "\n");
                cursor.fg.reset();
                throw err;
            }
        });
    }
    if (!fs.existsSync(mkvfx_build_root)) {
        fs.mkdir(mkvfx_build_root, function(err) {
            if (err) {
                cursor.red();
                stdout.write("MKVFX Could not create dir: " + mkvfx_build_root + "\n");
                cursor.fg.reset();
                throw err;
            }
        });
    }
    stdout.write("Checking for tools\n");
    var err = execTask('git --version');
    if (err) {
        cursor.red();
        stdout.write("MKVFX Could not find git, please install it and try again\n");
        cursor.fg.reset();
        throw err;
    }
    if (platform === "windows" && !check_for_7zip()) {
        cursor.red();
        stdout.write("MKVFX could not find 7zip, please install it and try again\n");
        cursor.fg.reset();
        throw err;
    }
    if (!check_for_make()) {
        cursor.red();
        stdout.write("MKVFX could not find make, please install it and try again\n");
        if (platform === "windows") {
            stdout.write("make is available here: http://gnuwin32.sourceforge.net/packages/make.htm\n");
        }
        cursor.fg.reset();
        throw err;
    }
    if (!check_for_cmake()) {
        cursor.red();
        stdout.write("MKVFX could not find cmake, please install it and try again\n");
        cursor.fg.reset();
        throw err;
    }
    // Note: Premake doesn't seem to run from here, but it does from the command line.
    if (false && !check_for_premake()) {
      cursor.red();
      stdout.write("MKVFX could not find premake, please install it and try again\n");
      stdout.write("It is available from here: http://industriousone.com/premake/download\n");
      cursor.fg.reset();
      throw err;
    }
    stdout.write("Validation complete\n\n");
}

validate_tool_chain();

function runRecipe(recipe, package_name, p, dir_name, execute) {
	stdout.write("package: " + package_name + " recipe: " + recipe + "\n");

	var build_dir = mkvfx_root;
    if ("build_in_" + platform in p) {
		build_dir = substitute_variables(p["build_in_" + platform]);
		stdout.write("in directory " + build_dir + "\n");
    }
	else if ("build_in" in p) {
		build_dir = substitute_variables(p.build_in);
		stdout.write("in directory " + build_dir + "\n");
	}
	else {
		build_dir = mkvfx_source_root + "/" + dir_name;
	}

	if (!fs.existsSync(build_dir)) {
		try {
			mkdirp.sync(build_dir);
		}
		catch (err) {
			cursor.red();
			stdout.write("Couldn't create build directory: " + build_dir + "\n");
			cursor.fg.reset();
			throw new Error("Couldn't create build directory for " + package_name);
		}
	}

	process.chdir(build_dir);

	// join all lines ending in +
	for (var r = recipe.length-2; r >= 0; --r) {
		var task = recipe[r];
		if (task.slice(-1) == "+") {
			recipe[r] = task.slice(0,-1) + " " + recipe[r+1];
			recipe.splice(r+1, 1);
		}
	}

	for (r = 0; r < recipe.length; ++r) {
		if (execute) {
			execTask(substitute_variables(recipe[r]), build_dir);
        }
		else {
			stdout.write("Simulating: " + substitute_variables(recipe[r]) + "\n");
        }
	}

	process.chdir(cwd);
}



function bake(package_name) {
	stdout.write("Baking " + package_name + "\n");
	if (package_name in built_packages) {
		return;
	}

	for (var i = 0; i < package_recipes.length; ++i) {
		if (package_recipes[i].name === package_name) {
			var p = package_recipes[i];
			if (option_do_dependencies && ("dependencies" in p || platform_dependencies in p)) {
                var dependencies = p.dependencies;
                if (platform_dependencies in p) {
                    dependencies = p[platform_dependencies]
                }
                for (var d = 0; d < dependencies.length; ++d) {
                    bake(dependencies[d]);
                }
				stdout.write("Dependencies of " + package_name + " baked, moving on the entree\n");
			}

			var repo_dir = "";
			var dir_name;
			if ("dir" in p) {
				dir_name = substitute_variables(p.dir);
			}
			else {
				throw new Error("No dir specified for \"" + package_name + "\" in recipe");
			}

			if ("repository" in p) {
				stdout.write("Fetching " + package_name + "\n");

				var dir_path = mkvfx_source_root + "/" + dir_name;

				var repository = p.repository;

				if (option_do_fetch) {
					var url = "";
					if ("url_osx" in repository) {
						url = repository.url_osx;
					}
					else if ("url" in repository) {
						url = repository.url;
					}

					if ("type" in repository && url !== "") {
						var type = repository.type;
						if (type == "git") {
							var cmd;
							if (fs.existsSync(dir_path)) {
								cmd = "git -C " + platform_path(dir_path) + " pull";
							}
							else {
								var branch = "";
								if ("branch" in repository) {
									branch = " --branch " + repository.branch + " ";
								}
								cmd = "git -C " + platform_path(mkvfx_source_root) + " clone --depth 1 " + branch + url + " " + dir_name;
							}
							execTask(cmd);
						}
						else if (type == "curl-tgz") {
                            if (!fs.existsSync(dir_path)) {
                                fs.mkdir(dir_path, function(err) {
                                    if (err) {
                                        cursor.red();
                                        stdout.write("MKVFX Could not find create dir: " + dir_path + "\n");
                                        cursor.fg.reset();
                                        throw err;
                                    }
                                });
                            }
                            if (platform === "windows") {
                                // reference http://stackoverflow.com/questions/9155289/calling-powershell-from-nodejs
                                // reference http://blog.commandlinekungfu.com/2009/11/episode-70-tangled-web.html
                                // reference http://stackoverflow.com/questions/1359793/programmatically-extract-tar-gz-in-a-single-step-on-windows-with-7zip
                                var exec = require('child_process').exec;
                                var command = "(New-Object System.Net.WebClient).DownloadFile('" + url + "','" + dir_path + "/download.tar.gz')";
                                var childProcess = execSync('powershell -Command "' + command + '"',
                                                        function(err,sysout,syserr) {
                                                            console.dir(sysout);
                                                        });
                                //childProcess.stdin.end();

                                stdout.write("\n\n" + 'powershell -Command"' + command + '"\n\n');

                                command = '7z x "' + dir_path + '/download.tar.gz' + '" -so | 7z x -aoa -si -ttar -o"' + dir_path + '"';
                                childProcess = execSync('cmd.exe \'/C' + command,
                                                        function(err,sysout,syserr) {
                                                            console.dir(sysout);
                                                        });
                                //childProcess.stdin.end();
                            }
                            else {
                                stdout.write("curl " + url + " to: " + dir_path + "\n");
                                cmd = "curl -L -o " + dir_path + "/" + package_name + ".tgz " + url;
                                execTask(cmd);
                                process.chdir(dir_path);
                                cmd = "tar -zxf " + package_name + ".tgz";
                                execTask(cmd);
                                process.chdir(cwd);
                            }
						}
					}
				}
				if ("repo_dir" in repository) {
					repo_dir = "/" + repository.repo_dir;
				}
			}
			else {
				stdout.write("Repository not specified, not fetching " + package_name + "\n");
			}

			if (option_do_build) {
				cursor.yellow();
				stdout.write("Building recipe: " + package_name + "\n");
				cursor.fg.reset();
				if (platform_recipe in p) {
					runRecipe(p[platform_recipe], package_name, p, dir_name, option_do_build);
				}
				else if ("recipe" in p) {
					runRecipe(p.recipe, package_name, p, dir_name, option_do_build);
				}
				else {
					cursor.red();
					stdout.write("No recipe exists for " + package_name + "\n");
					cursor.fg.reset();
					throw new Error("No recipe exists for " + package_name);
				}
			}

			if (option_do_install) {
				stdout.write("Installing " + package_name + "\n");
				if (platform_install in p) {
					runRecipe(p[platform_install], package_name, p, dir_name, option_do_install);
				}
				else if ("install" in p) {
					runRecipe(p.install, package_name, p, dir_name, option_do_install);
				}
				else {
					cursor.red();
					stdout.write("No install exists for " + package_name + "\n");
					cursor.fg.reset();
					throw new Error("No install exists for " + package_name);
				}
			}
		}
	}

	built_packages[package_name] = "built";
}

function printHelp() {
    stdout.write("mkvfx knows how to build:\n");
    cursor.yellow();
    for (var i = 0; i < package_recipes.length; ++i) {
 		var p = package_recipes[i];
        if ("platforms" in p) {
            var platforms = p.platforms;
            for (var j = 0; j < platforms.length; ++j) {
                if (platforms[j] === platform) {
                    stdout.write(" " + p.name + "\n");
                    break;
                }
            }
        }
        else
            stdout.write("  " + package_recipes[i].name + "\n");
    }
    cursor.fg.reset();
    stdout.write("\n\nmkvfx [options] [packages]\n\n");
    stdout.write("--help           this message\n");
    stdout.write("--install        install previously built package if possible\n");
    stdout.write("--nofetch        skip fetching, default is fetch\n");
    stdout.write("--nobuild        skip build, default is build\n");
    stdout.write("--nodependencies skip dependencies\n");
    stdout.write("-nfd             skip fetch and dependencies\n");
    stdout.write("[packages]       to build, default is nothing\n\n");
    stdout.write("\n\nNote that git repos are shallow cloned.\n");
}

// __dirname is the directory the script is located in
fs.readFile(__dirname + '/' + recipes_file, 'utf8', function(err, data) {
    var recipes = JSON.parse(data);
    package_recipes = recipes.packages;
    for (var i = 0; i < package_recipes.length; ++i) {
        var name = package_recipes[i].name;
        lower_case_map[name.toLowerCase()] = name;
    }

    var to_build = [];
    var arg;
    for (arg = 0; arg < args.length; ++arg) {
        var argLower = args[arg].toLowerCase();
        if (argLower == "--help") {
            printHelp();
        }
        else if (argLower === "--nofetch" || argLower === "-nf") {
            option_do_fetch = 0;
        }
        else if (argLower === "--nobuild" || argLower === "-nb") {
            option_do_build = 0;
        }
        else if (argLower == "--nodependencies" || argLower === "-nd") {
            option_do_dependencies = 0;
        }
        else if (argLower === "-nfd") {
            option_do_fetch = 0;
            option_do_dependencies = 0;
        }
        else if (argLower == "--noinstall" || argLower == "-ni") {
            option_do_install = 0;
        }
        else if (argLower == "--install") {
            option_do_fetch = 0;
            option_do_build = 0;
            option_do_dependencies = 0;
            option_do_install = 1;
        }
        else if (argLower in lower_case_map) {
            to_build.push(args[arg]);
        }
        else {
            cursor.red();
            stdout.write("Unknown option: " + args[arg] + "\n");
            cursor.fg.reset();
            throw new Error("Unknown option: " + args[arg]);
        }
    }
    for (arg = 0; arg < to_build.length; ++arg) {
        bake(lower_case_map[to_build[arg].toLowerCase()]);
    }

    if (!args.length) {
        printHelp();
    }
});
