#! /usr/bin/python
#
# * mkvfx
# * https://github.com/vfxpro99/mkvfx
# *
# * Copyright 2016 Nick Porcino
# * Licensed under the Apache 2 license.

# Portions of this code are from Pixar's build_usd.py script and are
# subject to this license:

#
# Copyright 2017 Pixar
#
# Licensed under the Apache License, Version 2.0 (the "Apache License")
# with the following modification; you may not use this file except in
# compliance with the Apache License and the following modification to it:
# Section 6. Trademarks. is deleted and replaced with:
#
# 6. Trademarks. This License does not grant permission to use the trade
#    names, trademarks, service marks, or product names of the Licensor
#    and its affiliates, except as required to comply with Section 4(c) of
#    the License and to reproduce the content of the NOTICE file.
#
# You may obtain a copy of the Apache License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the Apache License with the above modification is
# distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied. See the Apache License for the specific
# language governing permissions and limitations under the Apache License.
#



import argparse
import contextlib
import json
import os
import platform
import shutil
import subprocess
import sys
import time
import tarfile
import urllib2
import zipfile

from distutils.spawn import find_executable

version = "0.2.0"
print "mkvfx", version

#-----------------------------------------------------
# Command line options
#-----------------------------------------------------

option_do_fetch = 1
option_do_build = 1
option_do_install = 1
option_do_dependencies = 1
option_build_all = 0
option_force_build = 0

#-----------------------------------------------------
# Build management
#-----------------------------------------------------

lower_case_map = {}
built_packages = []
package_recipes = {}
to_build = []
recipes_file = ""       # @TODO read from command line

build_platform = ""
platform_compiler = ""

cwd = ""
home = ""
mkvfx_root = ""
mkvfx_build_root = ""

def print_help():
    global package_recipes, build_platform
    print "mkvfx knows how to build:"
    for p in package_recipes:
        if package_recipes[p]["platforms"]:
            if build_platform in package_recipes[p]["platforms"]:
                print ' ', package_recipes[p]['name']
        else:
            print ' ', package_recipes[p]['name']
    print "\nNote that git repos are shallow cloned.\n"

# Helpers for printing output
verbosity = 1

def Print(msg):
    if verbosity > 0:
        print msg

def PrintStatus(status):
    if verbosity >= 1:
        print "STATUS:", status

def PrintInfo(info):
    if verbosity >= 2:
        print "INFO:", info

def PrintCommandOutput(output):
    if verbosity >= 3:
        sys.stdout.write(output)

def PrintError(error):
    print "ERROR:", error

# Helpers for determining platform
def Windows():
    return platform.system() == "Windows"
def Linux():
    return platform.system() == "Linux"
def MacOS():
    return platform.system() == "Darwin"

@contextlib.contextmanager
def CurrentWorkingDirectory(dir):
    """Context manager that sets the current working directory to the given
    directory and resets it to the original directory when closed."""
    curdir = os.getcwd()
    os.chdir(dir)
    try: yield
    finally: os.chdir(curdir)

def DownloadURL(url, context, force):
    """Download and extract the archive file at given URL to the
    source directory specified in the context. Returns the absolute
    path to the directory where files have been extracted."""
    with CurrentWorkingDirectory(context.srcDir):
        # Extract filename from URL and see if file already exists.
        filename = url.split("/")[-1]
        if force and os.path.exists(filename):
            os.remove(filename)

        if os.path.exists(filename):
            PrintInfo("{0} already exists, skipping download"
                      .format(os.path.abspath(filename)))
        else:
            PrintInfo("Downloading {0} to {1}"
                      .format(url, os.path.abspath(filename)))
            try:
                r = urllib2.urlopen(url)
                with open(filename, "wb") as outfile:
                    outfile.write(r.read())
            except Exception as e:
                raise RuntimeError("Failed to download {url}: {err}"
                                   .format(url=url, err=e))

        # Open the archive and retrieve the name of the top-most directory.
        # This assumes the archive contains a single directory with all
        # of the contents beneath it.
        archive = None
        rootDir = None
        try:
            if tarfile.is_tarfile(filename):
                archive = tarfile.open(filename)
                rootDir = archive.getnames()[0].split('/')[0]
            elif zipfile.is_zipfile(filename):
                archive = zipfile.ZipFile(filename)
                rootDir = archive.namelist()[0].split('/')[0]
            else:
                raise RuntimeError("unrecognized archive file type")

            extractedPath = os.path.abspath(rootDir)
            if force and os.path.isdir(extractedPath):
                shutil.rmtree(extractedPath)

            if os.path.isdir(extractedPath):
                PrintInfo("Directory {0} already exists, skipping extract"
                          .format(extractedPath))
            else:
                PrintInfo("Extracting archive to {0}".format(extractedPath))
                archive.extractall()

            return extractedPath
        except Exception as e:
            raise RuntimeError("Failed to extract archive {filename}: {err}"
                               .format(filename=filename, err=e))


def userHome():
    return os.path.expanduser("~")

def platform_path(path):
    return '"' + path + '"'

def substitute_variables(context, subst):
    global mkvfx_root, mkvfx_build_root
    result = subst.replace("$(MKVFX_ROOT)", mkvfx_root)
    result = result.replace("$(MKVFX_SRC_ROOT)", context.srcDir)
    result = result.replace("$(MKVFX_BUILD_ROOT)", mkvfx_build_root)

    if result != subst:
        return substitute_variables(context, result)

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

def create_directory(path):
    if verbosity:
        print "Creating directory:", path

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

    print "Checking for tools\n"
    notFound = []

    if not find_executable("git"):
        PrintError("git not found -- please install it and adjust your PATH")
        notFound.append("git")

    if Windows() and not find_executable("7z"):
        print "MKVFX could not find 7zip, please install it and try again\n"
        notFound.append("7z")
        #sys.exit(1)

    if not Windows() and not find_executable("make"):
        print "MKVFX could not find make, please install it and try again\n"
        notFound.append("make")
        #sys.exit(1)

    if not find_executable("cmake"):
        print "MKVFX could not find cmake, please install it and try again\n"
        notFound.append("cmake")
        #sys.exit(1)

    if Windows() and not find_executable("nasm"):
        print "MKVFX could not find nasm, build steps requiring nasm will fail\n"
        notFound.append("nasm")
        #sys.exit(1)

    if not find_executable("premake5"):
        print "MKVFX could not find premake5. Build steps requiring premake5 will fail.\n"
        print "Premake is available from here: http://industriousone.com/premake/download\n"
        notFound.append("premake5")
        #sys.exit(1)

    print "Validation complete"

    if len(notFound) > 1:
        print "Some tools", notFound, "were not found, some recipes may not run\n"
    elif len(notFound) > 0:
        print "One tool", notFound, "was not found, some recipes may not run\n"

def create_directory_structure(root, src, build):
    create_directory(root)
    create_directory(root + '/bin')
    create_directory(root + '/include')
    create_directory(root + '/lib')
    create_directory(root + '/man')
    create_directory(root + '/man/man1')
    create_directory(src)
    create_directory(build)



#-----------------------------------------------------
# Build component dependencies
#-----------------------------------------------------

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

def runRecipe(context, recipe, package_name, package, dir_name, execute):
    global mkvfx_root, build_platform, cwd

    print "package:", package_name

    build_dir = get_data(package, 'build_in')
    if len(build_dir) == 0:
        build_dir = context.srcDir + "/" + dir_name

    build_dir = substitute_variables(context, build_dir)

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
        task = substitute_variables(context, t)
        if execute:
            execTask(task, build_dir)
        else:
            print "Simulating:", task

        os.chdir(cwd)

def bake(context, package_name):
    global built_packages, package_recipes
    global option_do_dependencies, option_do_fetch, option_do_build, option_do_install
    global build_platform
    global lower_case_map

    print "Baking", package_name
    if (not option_force_build) and package_name in built_packages:
        print package_name, "already built"
        return

    if not package_name.lower() in lower_case_map:
        print "Recipe for", package_name, "not found"
        sys.exit(1)

    recipe = package_recipes[package_name.lower()]
    if option_do_dependencies:
        dependencies = get_data(recipe, 'dependencies')
        for d in dependencies:
            bake(context, d)

        print "Dependencies of", package_name, "baked, moving on the entree"

    dir_name = get_data(recipe, 'dir')
    if dir_name == '':
    	print 'No source dir specified for "', package_name, '" in recipe'
        sys.exit(1)

    dir_name = substitute_variables(context, dir_name)

    repository = get_data(recipe, 'repository')
    if repository != '':
        print "Fetching", package_name, "from", repository
        dir_path = context.srcDir + "/" + dir_name

        if option_do_fetch:
            url = get_data(repository, 'url')
            type = get_data(repository, 'type')
            if len(type) > 0 and len(url) > 0:
                if type == "git":
                    cmd = ''
                    if os.path.exists(os.path.join(dir_path, ".git", "config")):
                        cmd = "git -C " + platform_path(dir_path) + " pull"
                    else:
                        branch = get_data(repository, 'branch')
                        if len(branch) > 0:
                            branch = " --branch " + repository.branch + " "
                        cmd = "git -C " + platform_path(context.srcDir) + " clone --depth 1 " + branch + url + " " + dir_name
                    execTask(cmd)
                elif type == "zip":
                    DownloadURL(url, context, False)
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
            runRecipe(context, run_recipe, package_name, recipe, dir_name, option_do_build)

    if option_do_install:
        print "Installing", package_name
        run_install = get_data(recipe, 'install')
        if len(run_install) > 0:
            runRecipe(context, run_install, package_name, recipe, dir_name, option_do_install)

    built_packages.append(package_name)





# Program starts here


validate_tool_chain()

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
cl_parser.add_argument('--force', dest='force', action='store_const', const=1, default=0, help="force rebuild")

group = cl_parser.add_argument_group(title="Directories")
group.add_argument("--src", type=str,
                   help=("Directory where dependencies will be downloaded "
                         "(default: <install_dir>/src)"))

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
if args.force:
    option_force_build = 1

#-----------------------------------------------------
# Directory set up
#-----------------------------------------------------

cwd = os.getcwd()
home = userHome()
mkvfx_root = cwd
mkvfx_build_root = home + "/mkvfx-build"

class InstallContext:
    def __init__(self, args):
        # Directory where dependencies will be downloaded and extracted
        self.srcDir = (os.path.abspath(args.src) if args.src
                       else home + "/mkvfx-sources")

context = InstallContext(args)


#-----------------------------------------------------
# Platform detection
#-----------------------------------------------------

# when other platforms are tested, this should be a platform detection block
# resolving to recipe_osx, recipe_darwin, recipe_linux, recipe_windows, recipe_ios, etc.

if MacOS():
    build_platform = "osx"
    platform_compiler = "clang"
    recipes_file = "recipes-osx64.json"

if Windows():
    if not 'DXSDK_DIR' in os.environ:
        os.environ['DXSDK_DIR'] = ' ' # Some cmake recipes still believe in this obsolete variable

    recipes_file = "recipes-win64.json"
    build_platform = "windows"
    platform_compiler = "vs2015"

if build_platform == "":
    print "Platform ", platform.system(), "not supported"
    sys.exit(1)

platform_recipe = "recipe_" + build_platform
platform_install = "install_" + build_platform
platform_dependencies = "dependencies_" + build_platform


create_directory_structure(mkvfx_root, context.srcDir, mkvfx_build_root)

# sys.path[0] is the directory the script is located in
recipe_path = sys.path[0] + '/lib/' + recipes_file
try:
    recipe_file = open(recipe_path, 'r')
except Exception as e:
    print "Could not open", recipe_path, "because", e
    sys.exit(1)

try:
    data = recipe_file.read()
    recipe_file.close()
except Exception as e:
    print "Could not read", recipe_path, "because", e
    sys.exit(0)

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

manifest_file_path = substitute_variables(context, '$(MKVFX_ROOT)/mkvfx-manifest.json')
try:
    manifest_file = open(manifest_file_path, 'r')
    data = manifest_file.read()
    manifest_file.close()
    built_packages = json.loads(data)
except:
    pass # if there was no existing manifest, it's fine

if option_build_all:
    for package in lower_case_map:
        bake(context, package)
else:
    for package in to_build:
        bake(context, package)

manifest_file = open(manifest_file_path, 'w')
manifest_file.write(json.dumps(built_packages, sort_keys=True))
manifest_file.close()

print 'MKVFX completed', time.ctime()
