# The following five lines of boilerplate have to be in your project's
# CMakeLists in this exact order for cmake to work correctly
cmake_minimum_required(VERSION 3.16)

# Single source: stackchan::custom::kFullVersion (OTA compares esp_app_desc->version)
set(_CUSTOM_VERSION_H "${CMAKE_CURRENT_SOURCE_DIR}/main/stackchan/custom/custom_version.h")
set(PROJECT_VER "1.5.1")
if(EXISTS "${_CUSTOM_VERSION_H}")
    file(STRINGS "${_CUSTOM_VERSION_H}" _kfv_lines REGEX "kFullVersion =")
    foreach(_kfv_line IN LISTS _kfv_lines)
        if(_kfv_line MATCHES "kFullVersion = \"([0-9.]+)\"")
            set(PROJECT_VER "${CMAKE_MATCH_1}")
            break()
        endif()
    endforeach()
endif()
add_definitions(-DFIRMWARE_VERSION=\"${PROJECT_VER}\")
message(STATUS "StackChan PROJECT_VER=${PROJECT_VER}")

# Add this line to disable the specific warning
add_compile_options(-Wno-missing-field-initializers)

# Auto-load a local sdkconfig overlay (git-ignored) when present. Lets
# self-hosted / custom deployments pin CONFIG_STACKCHAN_SERVER_URL,
# CONFIG_OTA_URL, etc. without touching committed defaults.
# Manual equivalent: SDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.local" idf.py build
if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/sdkconfig.defaults.local")
    set(SDKCONFIG_DEFAULTS
        "${CMAKE_CURRENT_SOURCE_DIR}/sdkconfig.defaults;${CMAKE_CURRENT_SOURCE_DIR}/sdkconfig.defaults.local"
        CACHE STRING "ESP-IDF sdkconfig default files (auto-extended with local overlay)" FORCE)
    message(STATUS "StackChan: detected sdkconfig.defaults.local, applying overlay")
endif()

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(stack-chan)
