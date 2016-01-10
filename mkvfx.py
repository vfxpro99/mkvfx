#! python
#
# * mkvfx
# * https://github.com/meshula/mkvfx
# *
# * Copyright 2016 Nick Porcino
# * Licensed under the BSD 2 clause license.

import argparse
import json
import os
import platform
import subprocess
import sys
import time

version = "0.2.0"

#-----------------------------------------------------
# Command line options
#-----------------------------------------------------

option_do_fetch = 1
option_do_build = 1
option_do_install = 1
option_do_dependencies = 1
option_build_all = 0

#-----------------------------------------------------
# Build management
#-----------------------------------------------------

lower_case_map = {}
built_packages = []
package_recipes = {}
to_build = []


def print_help():
    global package_recipes, build_platform
    print "mkvfx knows how to build:"
    for p in package_recipes:
        if "platforms" in p:
            if build_platform in p["platforms"]:
                print ' ', p["name"]
        else:
            print ' ', p["name"]
    print "\nNote that git repos are shallow cloned.\n"


class RecordLibAction(argparse.Action):
    def __call__(self, parser, namespace, values, option_string=None):
        global to_build
        to_build = values;

cl_parser = argparse.ArgumentParser(description='mkvfx')
cl_parser.add_argument('lib', action=RecordLibAction, nargs='*', help="library to build")
cl_parser.add_argument('-nf', '--nofetch', dest='nofetch', action='store_const', const=1, default=0, help="don't fetch repository")
cl_parser.add_argument('-nb', '--nobuild', dest='nobuild', action='store_const', const=1, default=0, help="don't build")
cl_parser.add_argument('-nd', '--nodependencies', dest='nodependencies', action='store_const', const=1, default=0, help="don't process dependencies")
cl_parser.add_argument('-nfd', dest='nfd', action='store_const', const=1, default=0, help="don't fetch repository or process dependencies")
cl_parser.add_argument('-ni', '--noinstall', dest='noinstall', action='store_const', const=1, default=0, help="don't install")
cl_parser.add_argument('-a', '--all', dest='all', action='store_const', const=1, default=0, help="process everything in the recipe file")
args = cl_parser.parse_args()

if args.nofetch or args.nfd:
    option_do_fetch = 0
if args.nobuild:
    option_do_build = 0
if args.nodependencies or args.nfd:
    option_do_dependencies = 0
if args.noinstall:
    option_do_install = 0
if args.all:
    option_build_all = 1

print "mkvfx", version


#-----------------------------------------------------
# Platform detection
#-----------------------------------------------------

# when other platforms are tested, this should be a platform detection block
# resolving to recipe_osx, recipe_darwin, recipe_linux, recipe_windows, recipe_ios, etc.
build_platform = ""
platform_compiler = ""
recipes_file = ""       # @TODO read from command line

if platform.system() == "Darwin":
    build_platform = "osx"
    platform_compiler = "clang"
    recipes_file = "recipes-osx64.json"

if platform.system() == "Windows":
    if not 'DXSDK_DIR' in os.environ:
        os.environ['DXSDK_DIR'] = ' ' # Some cmake recipes still believe in this obsolete variable

    recipes_file = "recipes-win64.json"
    build_platform = "windows"
    platform_compiler = "vs2015"

if build_platform == "":
    print "Platform ", platform.system(), "not supported"
    sys.exit(1)

platform_recipe = "recipe_" + build_platform;
platform_install = "install_" + build_platform;
platform_dependencies = "dependencies_" + build_platform;


#-----------------------------------------------------
# Directory set up
#-----------------------------------------------------

cwd = os.getcwd()

def userHome():
    return os.path.expanduser("~")

home = userHome()

mkvfx_root = cwd + "/local"
mkvfx_source_root = home + "/mkvfx-sources"
mkvfx_build_root = home + "/mkvfx-build"

def platform_path(path):
    return '"' + path + '"';

#-----------------------------------------------------
# Build component dependencies
#-----------------------------------------------------

searchedFor7zip = False
foundGit = False;
found7zip = False
searchedForCmake = False
foundCmake = False
searchedForMake = False
foundMake = False
searchedForPremake = False
foundPremake4 = False
foundPremake5 = False

def substitute_variables(subst):
    global mkvfx_root, mkvfx_source_root, mkvfx_build_root
    result = subst.replace("$(MKVFX_ROOT)", mkvfx_root)
    result = result.replace("$(MKVFX_SRC_ROOT)", mkvfx_source_root)
    result = result.replace("$(MKVFX_BUILD_ROOT)", mkvfx_build_root)

    if result != subst:
        return substitute_variables(result);

    return result

def execTask(task, workingDir='.'):
    print "Running", task

    restore_path = os.getcwd()
    status = 0 # assume success
    try:
        os.chdir(workingDir)
    except:
        print "Could not change directory to", workingDir
        return 1

    try:
        status = subprocess.call(task, shell=True)
    except Exception as e:
        print "Could not execute ", task, "\nbecause", e
        status = 1

    os.chdir(restore_path)
    return status


def check_for_7zip():
    global found7zip, searchedFor7zip
    if found7zip:
        return True
    if searchedFor7zip:
        return False

    result = execTask('7z > validation_tmp.txt')
    searchedFor7zip = True
    found7zip = not result # because zero means success
    return found7zip

def check_for_make():
    global foundMake, searchedForMake

    if build_platform == "windows":
        # nb: make on Windows is pretty darn sketchy at best. don't test.
        # not existing is a successful check :\
        return True

    if foundMake:
        return True
    if searchedForMake:
        return False

	result = execTask('make --version')
	searchedForMake = True
    foundMake = not result # because 0 means success
    return foundMake

def check_for_cmake():
    global foundCmake, searchedForCmake

    if foundCmake:
        return True
    if searchedForCmake:
        return False

    result = execTask('cmake --version')
    searchedForCmake = True
    foundCmake = not result # because 0 is success
    return foundCmake

def check_for_premake():
    global foundPremake4, foundPremake5, searchedForPremake

    if foundPremake4 and foundPremake5:
        return True
    if searchedForPremake:
        return False

    foundPremake4 = not execTask('premake4 --version')
    foundPremake5 = not execTask('premake5 --version')

    searchedForPremake = True
    return foundPremake4 and foundPremake5

def create_directory(path):
    exists = os.path.exists(path)
    if not os.path.isdir(path):
        if exists:
            print "Path exists but is not directory", path
            sys.exit(1)

        try:
            os.makedirs(path)
        except:
            print "Could not create directory", path
            sys.exit(1)

def validate_tool_chain():
    if build_platform == "windows":
        if not 'VisualStudioVersion' in os.environ:
            print "Environment does not have Visual Studio environment variables\n"
            print "Re-run after running VSVARS23.BAT\n"
            print "If running Powershell, invoke PowerShell from a Visual Studio CMD prompt, using 'powershell'\n"
            sys.exit(1)

    print "Validating directory structure\n"
    create_directory(mkvfx_root)
    create_directory(mkvfx_root + '/bin')
    create_directory(mkvfx_root + '/include')
    create_directory(mkvfx_root + '/lib')
    create_directory(mkvfx_root + '/man')
    create_directory(mkvfx_root + '/man/man1')
    create_directory(mkvfx_source_root)
    create_directory(mkvfx_build_root)

    print "Checking for tools\n"

    if execTask('git --version', '.'):
        foundGit = False
        print "MKVFX Could not find git, please install it and try again\n"
        #sys.exit(1)
    else:
        foundGit = True

    if build_platform == "windows" and not check_for_7zip():
        print "MKVFX could not find 7zip, please install it and try again\n"
        #sys.exit(1)

    if not check_for_make():
        print "MKVFX could not find make, please install it and try again\n"
        if build_platform == "windows":
            print "make is available here: http://gnuwin32.sourceforge.net/packages/make.htm\n"
        #sys.exit(1)

    if not check_for_cmake():
        print "MKVFX could not find cmake, please install it and try again\n"
        #sys.exit(1)

    if not check_for_premake():
        print "MKVFX could not find premake4 and/or 5, please install them and try again\n"
        print "Premake is available from here: http://industriousone.com/premake/download\n"
        #sys.exit(1)

    print "Validation complete"
    notFound = 0;
    if not foundGit: notFound = notFound + 1
    if not found7zip: notFound = notFound + 1
    if not foundMake: notFound = notFound + 1
    if not foundPremake4: notFound = notFound + 1
    if not foundPremake5: notFound = notFound + 1
    if notFound > 1:
        print "Some tools were not found, some recipes may not run"
    elif notFound > 0:
        print "One tool was not found, some recipes may not run"
    print

validate_tool_chain()

#-----------------------------------------------------
# La Trattoria
#-----------------------------------------------------

def get_data(recipe, data):
    global build_platform
    platform_data = data + '_' + build_platform
    if platform_data in recipe:
        return recipe[platform_data]
    if data in recipe:
        return recipe[data]
    return ''

def runRecipe(recipe, package_name, package, dir_name, execute):
    global mkvfx_root, mkvfx_source_root, build_platform, cwd

    print "package:", package_name

    build_dir = get_data(package, 'build_in')
    if len(build_dir) == 0:
        build_dir = mkvfx_source_root + "/" + dir_name

    build_dir = substitute_variables(build_dir)

    print "in directory:", build_dir
    exists = os.path.exists(build_dir)
    if not os.path.isdir(build_dir):
        if exists:
            print "Build path", build_dir, "exists, but is not a directory"
            sys.exit(1)

        try:
            os.makedirs(build_dir)
        except Exception as e:
            print "Could not create build directory", build_dir, "\nfor", package_name, "because", e
            sys.exit(1)

    os.chdir(build_dir)

	# join all lines ending in +
    theTasks = []
    r = 0
    while r < len(recipe):
        next_line = recipe[r]
        if next_line[-1] != '+':
            theTasks.append(next_line)
        else:
            task = next_line[0:-1]
            r += 1
            while r < len(recipe):
                next_line = recipe[r]
                if next_line[-1] != '+':
                    task += next_line
                    break
                task += next_line[0:-1]
                r += 1
            theTasks.append(task)
        r += 1

    for t in theTasks:
        task = substitute_variables(t)
        if execute:
            execTask(task, build_dir)
        else:
            print "Simulating:", task

        os.chdir(cwd);

def bake(package_name):
    global built_packages, package_recipes
    global option_do_dependencies, option_do_fetch, option_do_build, option_do_install
    global build_platform
    global mkvfx_source_root
    global lower_case_map

    print "Baking", package_name
    if package_name in built_packages:
        # already built this one
        return

    if not package_name.lower() in lower_case_map:
        print "Recipe for", package_name, "not found"
        sys.exit(1)

    recipe = package_recipes[package_name.lower()]
    if option_do_dependencies:
        dependencies = get_data(recipe, 'dependencies')
        for d in dependencies:
            bake(d)

        print "Dependencies of", package_name, "baked, moving on the entree"

    dir_name = get_data(recipe, 'dir')
    if dir_name == '':
    	print 'No source dir specified for "', package_name, '" in recipe'
        sys.exit(1)

    dir_name = substitute_variables(dir_name)

    repository = get_data(recipe, 'repository')
    if repository != '':
        print "Fetching", package_name, "from", repository
        dir_path = mkvfx_source_root + "/" + dir_name

        if option_do_fetch:
            url = get_data(repository, 'url')
            type = get_data(repository, 'type')
            if len(type) > 0 and len(url) > 0:
                if type == "git":
                    cmd = ''
                    if os.path.exists(dir_path):
                        cmd = "git -C " + platform_path(dir_path) + " pull"
                    else:
                        branch = get_data(repository, 'branch')
                        if len(branch) > 0:
                            branch = " --branch " + repository.branch + " "
                        cmd = "git -C " + platform_path(mkvfx_source_root) + " clone --depth 1 " + branch + url + " " + dir_name
                    execTask(cmd)
                elif type == "curl-tgz":
                    if not os.path.exists(dir_path):
                        try:
                            os.makedirs(dir_path)
                        except Exception as e:
                            print "Could not create fetch directory", dir_path, "because", e
                            sys.exit(1)

                    if build_platform == "windows":
                        # reference http://stackoverflow.com/questions/9155289/calling-powershell-from-nodejs
                        # reference http://blog.commandlinekungfu.com/2009/11/episode-70-tangled-web.html
                        # reference http://stackoverflow.com/questions/1359793/programmatically-extract-tar-gz-in-a-single-step-on-windows-with-7zip
                        command = "(New-Object System.Net.WebClient).DownloadFile('" + url + "','" + dir_path + "/download.tar.gz')"
                        execTask('powershell -Command "' + command + '"', dir_path)

                        command = '7z x "' + dir_path + '/download.tar.gz' + '" -so | 7z x -aoa -si -ttar -o"' + dir_path + '"'
                        execTask('cmd.exe \'/C' + command, dir_path)
                    else:
                        command = "curl -L -o " + dir_path + "/" + package_name + ".tgz " + url
                        execTask(command, dir_path)
                        command = "tar -zxf " + package_name + ".tgz"
                        execTask(command, dir_path)
    else:
        print "Repository not specified, nothing to fetch"

    if option_do_build:
        print "Building recipe:", package_name
        run_recipe = get_data(recipe, 'recipe')
        if len(run_recipe) > 0:
            runRecipe(run_recipe, package_name, recipe, dir_name, option_do_build)

    if option_do_install:
        print "Installing", package_name
        run_install = get_data(recipe, 'install')
        if len(run_install) > 0:
            runRecipe(run_install, package_name, recipe, dir_name, option_do_install)

    built_packages.append(package_name)


# sys.path[0] is the directory the script is located in
recipe_path = sys.path[0] + '/lib/' + recipes_file
try:
    recipe_file = open(recipe_path, 'r')
except Exception as e:
    print "Could not open", recipe_path, "because", e
    sys.exit(1)

try:
    data = recipe_file.read()
except Exception as e:
    print "Could not read", recipe_path, "because", e

json_data = json.loads(data)

for package in json_data['packages']:
    name = package['name']
    lower_case_map[name.lower()] = name
    package_recipes[name.lower()] = package

if len(to_build) == 0:
    print cl_parser.print_help()
    print_help()
    sys.exit(0)

print "Fetch %d Build %d Dependencies %d Install %d All %d" % (option_do_fetch, option_do_build, option_do_dependencies, option_do_install, option_build_all)
print "Building:\n", to_build

if option_build_all:
    for package in lower_case_map:
        bake(package)
else:
    for package in to_build:
        bake(package)

print 'MKVFX completed', time.ctime()
