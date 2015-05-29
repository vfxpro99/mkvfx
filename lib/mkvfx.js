#! /usr/bin/env node
/*
 * mkvfx
 * https://github.com/meshula/mkvfx
 *
 * Copyright (c) 2014 Nick Porcino
 * Licensed under the MIT license.
 */

'use strict';

var cwd = process.cwd();

function userHome() {
  return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
}

var home = userHome();

var mkvfx_root = cwd + "/local";
var mkvfx_source_root = home + "/mkvfx-sources";
var mkvfx_build_root = home + "/mkvfx-build";

var 
    ansi = require('ansi'),
//    assert = require('assert'),
    cursor = ansi(process.stdout),
//    exec = require("child_process").exec,
    execSync = require("child_process").execSync,
    fs = require('fs'),
    mkdirp = require('mkdirp'),
//    sys = require('sys'),
    usleep = require('sleep').usleep;

console.log(process.env.PATH)

// var token = 0;

var lower_case_map = {};
var built_packages = {};
var package_recipes;

var option_do_fetch = 1;
var option_do_build = 1;
var option_do_install = 1;
var option_do_dependencies = 1;

// when other platforms are tested, this should be a platform detection block
// resolving to recipe_osx, recipe_darwin, recipe_linux, recipe_windows, recipe_ios, etc.
var platform_recipe = "recipe_osx";
var platform_install = "install_osx";

var searchedForCmake = false;
var foundCmake = false;
var searchedForPremake = false;
var foundPremake = false;

exports.version = function() { return "0.1.0"; };

var args = process.argv.slice(2);

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
    console.log("Running: %s", task);
    cursor.fg.reset();

    var result;

    try {
        usleep(0); // allow kernel to have a kick at the can, necessary for ln to succeed

        if (workingDir) {
            result = execSync(task, {encoding:"utf8", cwd:workingDir});
        } else {
            result = execSync(task, {encoding:"utf8"});
        }
    }
    catch (e) {
        if (e.message != "spawnSync ENOTCONN") {
            // seems to be a bug in node.js version 0.11.14
            // calling ln results in an ENOTCONN.
            console.log(e.message);
            console.log(e.name);
            console.log(e.fileName);
            console.log(e.lineNumber);
            console.log(e.columnNumber);
            console.log(e.stack);
            throw e;
        }
        result = "";
    }

    process.stdout.write(result);
}

function check_for_cmake() {
	if (foundCmake)
		return true;
	if (searchedForCmake)
		return false;
	var result = true;
	try {
		result = execTask('cmake --version');
	}
	catch (err) {
		//...
	}
	searchedForCmake = true;
	if (!result)
		foundCmake = true;
	return foundCmake;
}

function check_for_premake() {
	if (foundPremake)
		return true;
	if (searchedForPremake)
		return false;
	var result = true;
	try {
		execTask('premake4 --version');
	}
	catch (err) {
		result = false;
	}
	searchedForPremake = true;
	if (result)
		foundPremake = true;
	return foundPremake;
}

function validate_tool_chain() {
    console.log("Validating directory structure");
    if (!fs.existsSync(mkvfx_root)) {
        fs.mkdir(mkvfx_root, function(err) {
            if (err) {
                cursor.red();
                console.log("MKVFX Could not create dir: %s", mkvfx_root);
                cursor.fg.reset();
                throw err;
            }
        });
    }
    if (!fs.existsSync(mkvfx_root+"/bin")) {
        fs.mkdir(mkvfx_root+"/bin", function(err) {
            if (err) {
                cursor.red();
                console.log("MKVFX Could not create dir: %s", mkvfx_root+"/bin");
                cursor.fg.reset();
                throw err;
            }
        });
    }
    if (!fs.existsSync(mkvfx_root+"/include")) {
        fs.mkdir(mkvfx_root+"/include", function(err) {
            if (err) {
                cursor.red();
                console.log("MKVFX Could not create dir: %s", mkvfx_root+"/include");
                cursor.fg.reset();
                throw err;
            }
        });
    }
    if (!fs.existsSync(mkvfx_root+"/lib")) {
        fs.mkdir(mkvfx_root+"/lib", function(err) {
            if (err) {
                cursor.red();
                console.log("MKVFX Could not create dir: %s", mkvfx_root+"/lib");
                cursor.fg.reset();
                throw err;
            }
        });
    }
    if (!fs.existsSync(mkvfx_root + "/man")) {
        fs.mkdir(mkvfx_root + "/man", function(err) {
            if (err) {
                cursor.red();
                console.log("MKVFX Could not create dir: %s", mkvfx_root + "/man");
                cursor.fg.reset();
                throw err;
            }
        });
    }
    if (!fs.existsSync(mkvfx_root + "/man/man1")) {
        fs.mkdir(mkvfx_root + "/man/man1", function(err) {
            if (err) {
                cursor.red();
                console.log("MKVFX Could not create dir: %s", mkvfx_root + "/man/man1");
                cursor.fg.reset();
                throw err;
            }
        });
    }
    if (!fs.existsSync(mkvfx_source_root)) {
        fs.mkdir(mkvfx_source_root, function(err) {
            if (err) {
                cursor.red();
                console.log("MKVFX Could not create dir: %s", mkvfx_source_root);
                cursor.fg.reset();
                throw err;
            }
        });
    }
    if (!fs.existsSync(mkvfx_build_root)) {
        fs.mkdir(mkvfx_build_root, function(err) {
            if (err) {
                cursor.red();
                console.log("MKVFX Could not create dir: %s", mkvfx_build_root);
                cursor.fg.reset();
                throw err;
            }
        });
    }
    console.log("Checking for tools");
    var err = execTask('git --version');
    if (err) {
        cursor.red();
        console.log("MKVFX Could not find git, please install it and try again");
        cursor.fg.reset();
        throw err;
    }
    if (!check_for_cmake()) {
    	cursor.red();
    	console.log("MKVFX could not find cmake, please install it and try again");
    	cursor.fg.reset();
    	throw err;
    }
    // Note: Premake doesn't seem to run from here, but it does from the command line.
    if (false && !check_for_premake()) {
    	cursor.red();
    	console.log("MKVFX could not find premake, please install it and try again");
    	console.log("It is available from here: http://industriousone.com/premake/download");
    	cursor.fg.reset();
    	throw err;
    }
    console.log("Validation complete");
}

validate_tool_chain();

function runRecipe(recipe, package_name, p, dir_name, execute) {
	console.log("package:%s recipe: %s", package_name, recipe);

	var build_dir = mkvfx_root;
	if ("build_in" in p) {
		build_dir = substitute_variables(p.build_in);
		console.log("in directory %s", build_dir);
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
			console.error("Couldn't create build directory ", build_dir);
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

	for (var r = 0; r < recipe.length; ++r) {
		if (execute)
			execTask(substitute_variables(recipe[r]), build_dir);
		else
			console.log("Simulating: %s", substitute_variables(recipe[r]));
	}

	process.chdir(cwd);
}



function bake(package_name) {
	console.log("Baking %s", package_name)
	if (package_name in built_packages) {
		return;
	}

	for (var i = 0; i < package_recipes.length; ++i) {
		if (package_recipes[i].name === package_name) {
			var p = package_recipes[i];
			if (option_do_dependencies) {
				if ("dependencies" in p) {
					var dependencies = p.dependencies;
					for (var d = 0; d < dependencies.length; ++d) {
						bake(dependencies[d]);
					}
				}
				console.log("Dependencies of %s baked, moving on the entree", package_name);
			}

			var repo_dir = "";
			var dir_name;
			if ("dir" in p) {
				dir_name = substitute_variables(p.dir);
			}
			else
				throw new Error("No dir specified for \"" + package_name + "\" in recipe");

			if ("repository" in p) {
				console.log("Fetching %s", package_name);

				var dir_path = mkvfx_source_root + "/" + dir_name;

				var repository = p.repository;

				if (option_do_fetch) {
					var url = "";
					if ("url_osx" in repository)
						url = repository.url_osx;
					else if ("url" in repository)
						url = repository.url;

					if ("type" in repository && url != "") {
						var type = repository.type;
						if (type == "git") {
							var cmd;
							if (fs.existsSync(dir_path)) {
								cmd = "git -C " + dir_path + " pull";
							}
							else {
								var branch = "";
								if ("branch" in repository) {
									branch = " --branch " + repository.branch + " ";
								}
								cmd = "git -C " + mkvfx_source_root + " clone --depth 1 " + branch + url + " " + dir_name;
							}
							execTask(cmd);
						}
						else if (type == "curl-tgz") {
							console.log("curl from: %s", dir_path);
							if (!fs.existsSync(dir_path)) {
								fs.mkdir(dir_path, function(err) {
									if (err) {
								    	cursor.red();
								    	console.log("MKVFX Could not find create dir: %s", dir_path);
								    	cursor.fg.reset();
								    	throw err;
									}
								});
							}
							cmd = "curl -L -o " + dir_path + "/" + package_name + ".tgz " + url;
							execTask(cmd);
							process.chdir(dir_path);
							cmd = "tar -zxf " + package_name + ".tgz";
							execTask(cmd);
							process.chdir(cwd);
						}
					}
				}
				if ("repo_dir" in repository) {
					repo_dir = "/" + repository.repo_dir;
				}
			}
			else {
				console.log("Repository not specified for %s, not fetching", package_name);
			}

			if (option_do_build) {
				cursor.yellow();
				console.log("Building %s recipe", package_name);
				cursor.fg.reset();
				if (platform_recipe in p) {
					// how to fetch platform_recipe from p?
					runRecipe(p.recipe_osx, package_name, p, dir_name, option_do_build);
				}
				else if ("recipe" in p) {
					runRecipe(p.recipe, package_name, p, dir_name, option_do_build);
				}
				else {
					cursor.red();
					console.log("No recipe exists for " + package_name);
					cursor.fg.reset();
					throw new Error("No recipe exists for " + package_name);
				}
			}

			if (option_do_install) {				
				console.log("Installing %s", package_name);
				if (platform_install in p) {
					// how to fetch platform_install from p?
					runRecipe(p.install_osx, package_name, p, dir_name, option_do_install);
				}
				else if ("install" in p) {
					runRecipe(p.install, package_name, p, dir_name, option_do_install);
				}
				else {
					cursor.red();
					console.log("No install exists for " + package_name);
					cursor.fg.reset();
					throw new Error("No install exists for " + package_name);
				}
			}
		}		
	}

	built_packages[package_name] = "built";
}

function printHelp() {
    console.log("mkvfx knows how to build:");
    cursor.yellow();
    for (var i = 0; i < package_recipes.length; ++i) {
        console.log("%s", package_recipes[i].name);
    }
    cursor.fg.reset();
    console.log("\n\nmkvfx [options] [packages]\n");
    console.log("--help           this message");
    console.log("--install        install previously built package if possible");
    console.log("--nofetch        skip fetching, default is fetch");
    console.log("--nobuild        skip build, default is build");
    console.log("--nodependencies skip dependencies");
    console.log("-nfd             skip fetch and dependencies");
    console.log("[packages]       to build, default is nothing");
    console.log("\n\nNote that git repos are shallow cloned.");
}

// __dirname is the directory the script is located in
fs.readFile(__dirname + '/recipes.json', 'utf8', function(err, data) {
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
            console.log("Unknown option %s", args[arg]);
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
